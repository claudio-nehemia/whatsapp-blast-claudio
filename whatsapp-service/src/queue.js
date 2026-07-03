import { sendMessage } from './sender.js';
import axios from 'axios';

let activeBlastJobs = [];
let isPaused = false;
let isCancelled = false;
let currentJobIndex = -1;
let currentBlastId = null;

// Callback URL to Rust Backend
let rustBackendUrl = process.env.RUST_BACKEND_URL || 'http://127.0.0.1:8000';

export function setRustBackendUrl(url) {
  rustBackendUrl = url;
}

async function sendCallback(endpoint, data) {
  try {
    await axios.post(`${rustBackendUrl}${endpoint}`, data);
  } catch (error) {
    console.error(`Callback to Rust backend failed (${endpoint}):`, error.message);
  }
}

export function startBlast({ blastId, sessionId, recipients, templateText, imagePath, settings }) {
  // If a blast is already running and not completed/cancelled, reject
  if (currentBlastId && !isCancelled && currentJobIndex < activeBlastJobs.length && currentJobIndex >= 0) {
    throw new Error('A blast is already running');
  }

  currentBlastId = blastId;
  activeBlastJobs = recipients.map(r => ({
    blastId,
    sessionId,
    recipientId: r.recipientId, // blast_recipient _id in DB
    phone: r.phone,
    text: r.text, // personalized text
    imagePath: imagePath,
    retryCount: 0,
    maxRetry: settings.maxRetry || 3,
    minDelay: settings.minDelay || 5,
    maxDelay: settings.maxDelay || 10,
    typingSimulation: settings.typingSimulation !== false
  }));

  isPaused = false;
  isCancelled = false;
  currentJobIndex = 0;

  // Start processing async
  processQueue();

  return { success: true, total: activeBlastJobs.length };
}

async function processQueue() {
  while (currentJobIndex < activeBlastJobs.length) {
    if (isCancelled) {
      console.log(`Blast ${currentBlastId} was cancelled.`);
      await sendCallback('/api/internal/blast-status', {
        blastId: currentBlastId,
        status: 'Cancelled'
      });
      clearQueue();
      return;
    }

    if (isPaused) {
      // Sleep a bit and check again
      await new Promise(resolve => setTimeout(resolve, 1000));
      continue;
    }

    const job = activeBlastJobs[currentJobIndex];
    console.log(`Processing job ${currentJobIndex + 1}/${activeBlastJobs.length} for phone: ${job.phone}`);

    // Send callback: Sending
    await sendCallback('/api/internal/recipient-status', {
      blastId: job.blastId,
      recipientId: job.recipientId,
      status: 'Sending'
    });

    let success = false;
    let errorMsg = '';

    while (job.retryCount <= job.maxRetry && !success && !isCancelled) {
      try {
        // Delay before sending (randomized)
        if (currentJobIndex > 0 || job.retryCount > 0) {
          const delaySec = Math.floor(Math.random() * (job.maxDelay - job.minDelay + 1)) + job.minDelay;
          console.log(`Waiting for delay: ${delaySec}s`);
          await new Promise(resolve => setTimeout(resolve, delaySec * 1000));
        }

        if (isCancelled) break;

        await sendMessage({
          sessionId: job.sessionId,
          phone: job.phone,
          text: job.text,
          imagePath: job.imagePath,
          typingSimulation: job.typingSimulation
        });

        success = true;
      } catch (err) {
        job.retryCount++;
        errorMsg = err.message || 'Unknown error';
        console.error(`Attempt ${job.retryCount} failed for ${job.phone}: ${errorMsg}`);
        if (job.retryCount <= job.maxRetry && !isCancelled) {
          // Wait 3 seconds before retry
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
    }

    if (isCancelled) {
      continue;
    }

    if (success) {
      await sendCallback('/api/internal/recipient-status', {
        blastId: job.blastId,
        recipientId: job.recipientId,
        status: 'Success',
        sentAt: new Date().toISOString()
      });
    } else {
      await sendCallback('/api/internal/recipient-status', {
        blastId: job.blastId,
        recipientId: job.recipientId,
        status: 'Failed',
        errorMessage: errorMsg
      });
    }

    currentJobIndex++;
  }

  // If completed all jobs
  if (currentJobIndex >= activeBlastJobs.length && activeBlastJobs.length > 0) {
    console.log(`Blast ${currentBlastId} completed.`);
    await sendCallback('/api/internal/blast-status', {
      blastId: currentBlastId,
      status: 'Completed'
    });
    clearQueue();
  }
}

export function pauseBlast() {
  isPaused = true;
  return { success: true, status: 'paused' };
}

export function resumeBlast() {
  isPaused = false;
  return { success: true, status: 'running' };
}

export function cancelBlast() {
  isCancelled = true;
  return { success: true, status: 'cancelled' };
}

export function getQueueStatus() {
  if (!currentBlastId) {
    return { status: 'idle' };
  }
  return {
    blastId: currentBlastId,
    status: isCancelled ? 'cancelled' : (isPaused ? 'paused' : 'running'),
    total: activeBlastJobs.length,
    current: currentJobIndex,
    progress: activeBlastJobs.length > 0 ? Math.round((currentJobIndex / activeBlastJobs.length) * 100) : 0
  };
}

function clearQueue() {
  activeBlastJobs = [];
  currentJobIndex = -1;
  currentBlastId = null;
  isPaused = false;
  isCancelled = false;
}
