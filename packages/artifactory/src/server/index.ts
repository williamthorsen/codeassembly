import cors from 'cors';
import type { ErrorRequestHandler } from 'express';
import express from 'express';

import { createProjectsRouter } from './routes/projects.js';
import { createRunsRouter } from './routes/runs.js';
import { ProjectScanner } from './services/project-scanner.js';

const app = express();
const port = 5181;

// Middleware
app.use(cors({ origin: 'http://localhost:5180' }));
app.use(express.json());

// Initialize scanner
const scanner = new ProjectScanner();

// Routes
app.use('/api/projects', createProjectsRouter(scanner));
app.use('/api/runs', createRunsRouter(scanner));

// Error handling with proper types
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
};
app.use(errorHandler);

// Start server
app.listen(port, () => {
  console.info(`Artifactory API listening on port ${port}`);
  console.info('Scanning projects...');

  async function scanOnStartup() {
    try {
      const index = await scanner.scan();
      const projectCount = index.projects.length;
      const runCount = index.projects.reduce(
        (sum, p) => sum + p.tickets.reduce((s, t) => s + t.runs.length, 0),
        0,
      );
      console.info(`Found ${projectCount} projects, ${runCount} runs`);
    } catch (error) {
      console.error('Failed to scan projects on startup:', error);
    }
  }

  void scanOnStartup();
});
