# HPC Dashboard

A modern, web-based dashboard for managing High Performance Computing (HPC) clusters (specifically designed for Kamiak). This application replaces traditional command-line interactions with a user-friendly graphical interface.

## Features

-   **Dashboard & Auth**: Secure SSH-based login and cluster status overview.
-   **File Manager**:
    -   Browse remote directories.
    -   View and edit files (with syntax highlighting).
    -   Create path-based navigation.
    -   **File Deletion** (with safety prompts).
-   **Job Management**:
    -   **Job Composer**: UI-based Slurm script generator (Standard & GPU templates).
    -   **Job Monitor**: status of active queues and historical jobs.
    -   **Job Cancellation**: Cancel running jobs directly from the UI.
-   **Web Terminal**: Built-in console for executing quick shell commands.

## Prerequisites

-   Node.js 18+
-   Access to an HPC cluster (via SSH)

## Installation

1.  Clone the repository:
    `ash
    git clone <repository-url>
    cd <repository-directory>
    `

2.  Install dependencies:
    `ash
    npm install
    `

## Development

To run the development server:

`ash
npm run dev
`

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Production Build

### Standard Build
To build the application for production:

`ash
npm run build
npm start
`

### Standalone Build (Recommended for Deployment)
This project is configured to produce a standalone build, which creates a self-contained folder that does not require 
ode_modules.

1.  Build the project:
    `ash
    npm run build
    `

2.  The standalone build is located in .next/standalone.

3.  **Deployment Steps**:
    -   Copy the .next/standalone folder to your server.
    -   **Important**: Copy .next/static to .next/standalone/.next/static.
    -   **Important**: Copy public to .next/standalone/public.
    -   Run the server: 
ode server.js

### Windows Helper Script
For Windows users, a helper script un_standalone.bat is included. It automatically handles the copying of assets and starting the server.

## Technologies

-   [Next.js 16](https://nextjs.org/) (App Router)
-   [React](https://react.dev/)
-   [Tailwind CSS](https://tailwindcss.com/)
-   [SSH2](https://github.com/mscdex/ssh2) (Backend SSH handling)
