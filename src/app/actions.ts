'use server';

import { executeCommand, SSHCredentials } from '../lib/ssh';

export interface FileEntry {
  name: string;
  isDirectory: boolean;
  size: string;
  permissions: string;
  updatedAt: string;
}

export interface JobConfig {
  name: string;
  partition: string;
  nodes: number;
  cpus: number;
  memory: string;
  time: string;
  script: string;
}

export interface JobQueueEntry {
  jobId: string;
  partition: string;
  name: string;
  user: string;
  state: string;
  time: string;
  timeLimit: string;
  nodes: string;
  nodelist: string;
}

export interface JobHistoryEntry {
  jobId: string;
  name: string;
  partition: string;
  state: string;
  exitCode: string;
}

export async function verifyConnection(credentials: SSHCredentials) {
  try {
    const result = await executeCommand(credentials, 'echo "Connection Verified"');
    if (result.code !== 0) {
      throw new Error(result.stderr || 'Command failed');
    }
    return { success: true, message: 'Connected successfully' };
  } catch (error) {
    console.error('Connection failed:', error);
    return { success: false, error: (error as Error).message || 'Connection failed' };
  }
}

export async function listFiles(credentials: SSHCredentials, path: string = '~'): Promise<{ success: boolean; files: FileEntry[]; error?: string; currentPath?: string }> {
  try {
    let targetPath = path;
    if (path === '~') {
      const pwdResult = await executeCommand(credentials, 'pwd');
      if (pwdResult.code === 0) {
        targetPath = pwdResult.stdout.trim();
      }
    }

    const command = `ls -lA --time-style=long-iso "${targetPath}"`;
    const result = await executeCommand(credentials, command);

    if (result.code !== 0) {
      throw new Error(result.stderr || 'Failed to list files');
    }

    const pwdResult = await executeCommand(credentials, `cd "${targetPath}" && pwd`);
    const currentPath = pwdResult.stdout.trim();

    const lines = result.stdout.split('\n');
    const files: FileEntry[] = lines
      .slice(1)
      .filter(line => line.trim() !== '')
      .map(line => {
        const parts = line.split(/\s+/);
        if (parts.length < 8) return null;

        const permissions = parts[0];
        const isDirectory = permissions.startsWith('d');
        const size = parts[4];
        const date = `${parts[5]} ${parts[6]}`;
        const name = parts.slice(7).join(' ');

        return {
          name,
          isDirectory,
          size,
          permissions,
          updatedAt: date
        };
      })
      .filter((file): file is FileEntry => file !== null);

    return { success: true, files, currentPath };
  } catch (error) {
    console.error('List files failed:', error);
    return { success: false, files: [], error: (error as Error).message || 'Failed to list files' };
  }
}

export async function readFileContent(credentials: SSHCredentials, path: string): Promise<{ success: boolean; content: string; error?: string }> {
  try {
    const result = await executeCommand(credentials, `cat "${path}"`);
    if (result.code !== 0) {
      throw new Error(result.stderr || 'Failed to read file');
    }
    return { success: true, content: result.stdout };
  } catch (error) {
    return { success: false, content: '', error: (error as Error).message };
  }
}

export async function saveFileContent(credentials: SSHCredentials, path: string, content: string): Promise<{ success: boolean; error?: string }> {
  try {
    const base64Content = Buffer.from(content).toString('base64');
    const command = `echo "${base64Content}" | base64 -d > "${path}"`;
    const result = await executeCommand(credentials, command);

    if (result.code !== 0) {
      throw new Error(result.stderr || 'Save failed');
    }
    return { success: true };
  } catch (error) {
    console.error('Save file failed:', error);
    return { success: false, error: (error as Error).message };
  }
}

export async function runTerminalCommand(credentials: SSHCredentials, command: string, cwd: string = '~'): Promise<{ success: boolean; output: string; newCwd: string; error?: string }> {
  try {
    const safeCwd = cwd || '~';
    // Use semi-colon to ensure pwd runs even if command fails
    const shellCommand = `cd "${safeCwd}"; ${command}; echo ""; echo "__PWD__"; pwd`;

    const result = await executeCommand(credentials, shellCommand);

    const parts = result.stdout.split('__PWD__');
    const output = parts[0].replace(/\n$/, '');
    const newCwd = parts[1] ? parts[1].trim() : safeCwd;

    return {
      success: result.code === 0,
      output: output,
      newCwd: newCwd
    };
  } catch (error) {
    console.error('Terminal command failed:', error);
    return { success: false, output: '', newCwd: cwd, error: (error as Error).message };
  }
}

export async function submitJob(credentials: SSHCredentials, job: JobConfig): Promise<{ success: boolean; jobId?: string; error?: string }> {
  try {
    const safeScript = job.script.replace(/'/g, "'\''");
    const sbatchContent = `#!/bin/bash
#SBATCH --job-name=${job.name}
#SBATCH --partition=${job.partition}
#SBATCH --nodes=${job.nodes}
#SBATCH --cpus-per-task=${job.cpus}
#SBATCH --mem=${job.memory}
#SBATCH --time=${job.time}

${safeScript}
`;

    const timestamp = Date.now();
    const filename = `job_${timestamp}.slurm`;
    const command = `cat << 'EOF' > ${filename}
${sbatchContent}
EOF
sbatch ${filename}
rm ${filename}
`;

    const result = await executeCommand(credentials, command);

    if (result.code !== 0) {
      throw new Error(result.stderr || 'Failed to submit job');
    }

    const match = result.stdout.match(/Submitted batch job (\d+)/);
    const jobId = match ? match[1] : undefined;

    return { success: true, jobId };
  } catch (error) {
    console.error('Job submission failed:', error);
    return { success: false, error: (error as Error).message };
  }
}

export async function getJobQueue(credentials: SSHCredentials): Promise<{ success: boolean; jobs: JobQueueEntry[]; error?: string }> {
  try {
    // Uses -u username compatible with older Slurm
    const command = `squeue -u ${credentials.username} --format="%.18i %.9P %.30j %.8u %.8T %.10M %.9l %.6D %R" --noheader`;
    const result = await executeCommand(credentials, command);

    if (result.code !== 0) {
      throw new Error(result.stderr || 'Failed to get job queue');
    }

    const lines = result.stdout.split('\n').filter(line => line.trim() !== '');
    const jobs: JobQueueEntry[] = lines.map(line => {
      const parts = line.trim().split(/\s+/);
      return {
        jobId: parts[0],
        partition: parts[1],
        name: parts[2],
        user: parts[3],
        state: parts[4],
        time: parts[5],
        timeLimit: parts[6],
        nodes: parts[7],
        nodelist: parts[8]
      };
    });

    return { success: true, jobs };
  } catch (error) {
    console.error('Get queue failed:', error);
    return { success: false, jobs: [], error: (error as Error).message };
  }
}

export async function getJobHistory(credentials: SSHCredentials): Promise<{ success: boolean; jobs: JobHistoryEntry[]; error?: string }> {
  try {
    const command = `sacct -X -u ${credentials.username} --format=JobID,JobName,Partition,State,ExitCode -n`;
    const result = await executeCommand(credentials, command);

    if (result.code !== 0) {
      throw new Error(result.stderr || 'Failed to get job history');
    }

    const lines = result.stdout.split('\n').filter(line => line.trim() !== '');
    const jobs: JobHistoryEntry[] = lines.map(line => {
      const parts = line.trim().split(/\s+/);
      return {
        jobId: parts[0],
        name: parts[1],
        partition: parts[2],
        state: parts[3],
        exitCode: parts[4]
      };
    });

    return { success: true, jobs };
  } catch (error) {
    console.error('Get history failed:', error);
    return { success: true, jobs: [] };
  }
}

export async function cancelJob(credentials: SSHCredentials, jobId: string): Promise<{ success: boolean; error?: string }> {
  if (credentials.username === 'demo') {
    return { success: true };
  }
  try {
    const result = await executeCommand(credentials, `scancel ${jobId}`);
    if (result.code !== 0) {
      throw new Error(result.stderr || 'Failed to cancel job');
    }
    return { success: true };
  } catch (error) {
    console.error('Cancel job failed:', error);
    return { success: false, error: (error as Error).message };
  }
}

export async function deleteFile(credentials: SSHCredentials, path: string): Promise<{ success: boolean; error?: string }> {
  try {
    const command = `rm -rf "${path}"`;
    const result = await executeCommand(credentials, command);

    if (result.code !== 0) {
      throw new Error(result.stderr || 'Delete failed');
    }
    return { success: true };
  } catch (error) {
    console.error('Delete file failed:', error);
    return { success: false, error: (error as Error).message };
  }
}

export async function getStorageQuota(credentials: SSHCredentials): Promise<{ success: boolean; quota?: { used: string; size: string; percent: string }; error?: string }> {
  try {
    const command = `df -H .`;
    const result = await executeCommand(credentials, command);

    if (result.code !== 0) {
      throw new Error(result.stderr || 'Failed to get storage quota');
    }

    const lines = result.stdout.trim().split('\n');
    if (lines.length >= 2) {
      // The output usually has a header line and then the data line.
      // We grab the last line in case the filesystem name wraps into multiple lines.
      const lastLine = lines[lines.length - 1];
      const parts = lastLine.trim().split(/\s+/);

      // Counting from the right handles spaces in the filesystem name.
      // Format usually is: Filesystem Size Used Avail Use% Mounted on
      // Mounted on (last), Use% (2nd to last), Avail (3rd to last), Used (4th to last), Size (5th to last)
      const percent = parts[parts.length - 3];
      const used = parts[parts.length - 4];
      const size = parts[parts.length - 5];

      return { success: true, quota: { used, size, percent } };
    }
    return { success: false, error: 'Unexpected output format' };
  } catch (error) {
    console.error('Get storage quota failed:', error);
    return { success: false, error: (error as Error).message };
  }
}

export async function setHuggingFaceToken(credentials: SSHCredentials, token: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Escape single quotes to prevent injection
    const safeToken = token.replace(/'/g, "'\\''");
    const command = `hf auth login --token '${safeToken}'`;
    const result = await executeCommand(credentials, command);

    if (result.code !== 0) {
      throw new Error(result.stderr || 'Failed to authenticate with Hugging Face');
    }
    return { success: true };
  } catch (error) {
    console.error('Hugging Face auth failed:', error);
    return { success: false, error: (error as Error).message };
  }
}

export async function checkHuggingFaceAuth(credentials: SSHCredentials): Promise<{ success: boolean; username?: string; error?: string }> {
  try {
    const command = `hf auth whoami`;
    const result = await executeCommand(credentials, command);

    if (result.code !== 0) {
      // Not authenticated or error
      return { success: false, error: 'Not authenticated' };
    }

    // Output looks like "user:  TimBrat1234"
    const cleanOutput = result.stdout.replace(/\x1B\[[0-9;]*m/g, '');
    const match = cleanOutput.match(/user:\s+(\S+)/i);

    if (match && match[1]) {
      return { success: true, username: match[1] };
    }

    return { success: false, error: 'Could not parse username' };
  } catch (error) {
    console.error('Hugging Face auth check failed:', error);
    return { success: false, error: (error as Error).message };
  }
}


