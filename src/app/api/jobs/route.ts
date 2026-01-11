import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import type { Job, AudiobookJobData } from '@/types/jobs';

// In-memory job store (would use Redis or database in production)
const jobs = new Map<string, Job>();
const jobProcessors = new Map<string, AbortController>();

/**
 * GET /api/jobs - Get all jobs or a specific job
 * Query params:
 * - id: Get specific job by ID
 * - status: Filter jobs by status
 */
export async function GET(request: NextRequest) {
  try {
    const jobId = request.nextUrl.searchParams.get('id');
    const status = request.nextUrl.searchParams.get('status');

    // Get specific job
    if (jobId) {
      const job = jobs.get(jobId);
      if (!job) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }
      return NextResponse.json(job);
    }

    // Get all jobs or filter by status
    let allJobs = Array.from(jobs.values());
    if (status) {
      allJobs = allJobs.filter(job => job.status === status);
    }

    // Sort by creation date (newest first)
    allJobs.sort((a, b) => b.createdAt - a.createdAt);

    return NextResponse.json({ jobs: allJobs });
  } catch (error) {
    console.error('Error fetching jobs:', error);
    return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 });
  }
}

/**
 * POST /api/jobs - Create a new background job
 * Body: AudiobookJobData
 */
export async function POST(request: NextRequest) {
  try {
    const data: AudiobookJobData = await request.json();

    // Validate required fields
    if (!data.documentId || !data.documentName || !data.voice) {
      return NextResponse.json(
        { error: 'Missing required fields: documentId, documentName, voice' },
        { status: 400 }
      );
    }

    // Create new job
    const job: Job = {
      id: randomUUID(),
      type: 'audiobook-generation',
      status: 'pending',
      data,
      progress: 0,
      createdAt: Date.now(),
    };

    jobs.set(job.id, job);

    // Start processing the job in the background
    processJobInBackground(job.id);

    return NextResponse.json(job, { status: 201 });
  } catch (error) {
    console.error('Error creating job:', error);
    return NextResponse.json({ error: 'Failed to create job' }, { status: 500 });
  }
}

/**
 * DELETE /api/jobs?id=<jobId> - Cancel or delete a job
 */
export async function DELETE(request: NextRequest) {
  try {
    const jobId = request.nextUrl.searchParams.get('id');
    if (!jobId) {
      return NextResponse.json({ error: 'Missing job ID' }, { status: 400 });
    }

    const job = jobs.get(jobId);
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // If job is processing, abort it
    const processor = jobProcessors.get(jobId);
    if (processor) {
      processor.abort();
      jobProcessors.delete(jobId);
    }

    // Update job status to cancelled
    job.status = 'cancelled';
    job.completedAt = Date.now();
    jobs.set(jobId, job);

    return NextResponse.json({ success: true, job });
  } catch (error) {
    console.error('Error deleting job:', error);
    return NextResponse.json({ error: 'Failed to delete job' }, { status: 500 });
  }
}

/**
 * Background job processor
 * Processes audiobook generation jobs
 */
async function processJobInBackground(jobId: string) {
  const job = jobs.get(jobId);
  if (!job) return;

  const controller = new AbortController();
  jobProcessors.set(jobId, controller);

  try {
    // Update job status to processing
    job.status = 'processing';
    job.startedAt = Date.now();
    job.currentStep = 'Loading document...';
    jobs.set(jobId, job);

    const { documentId, voice, speed, ttsProvider, ttsModel, ttsInstructions, format } = job.data;

    // In a real implementation, this would:
    // 1. Load the document from IndexedDB or file system
    // 2. Extract all text content
    // 3. Split into sentences
    // 4. Generate TTS for each sentence
    // 5. Combine into final audiobook file

    // For now, we'll create a simplified version that shows the concept
    job.currentStep = 'Document loaded. Starting TTS generation...';
    job.progress = 10;
    jobs.set(jobId, job);

    // Simulate processing (in production, this would call actual TTS API)
    // This is where you'd integrate with the existing TTS generation logic
    console.log(`Processing job ${jobId} for document ${documentId}`);
    console.log(`Using voice: ${voice}, speed: ${speed}, provider: ${ttsProvider}, model: ${ttsModel}`);

    // TODO: Implement actual audiobook generation
    // For now, just simulate progress
    const totalSteps = 10;
    for (let i = 0; i < totalSteps; i++) {
      if (controller.signal.aborted) {
        throw new Error('Job cancelled by user');
      }

      job.progress = 10 + (i / totalSteps) * 80;
      job.currentStep = `Processing sentence ${i + 1}/${totalSteps}...`;
      jobs.set(jobId, job);

      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Job completed successfully
    job.status = 'completed';
    job.progress = 100;
    job.currentStep = 'Audiobook generation complete!';
    job.completedAt = Date.now();
    job.result = {
      bookId: randomUUID(),
      format: format || 'mp3',
      totalDuration: 300, // 5 minutes (example)
      chapterCount: 1,
    };
    jobs.set(jobId, job);

    jobProcessors.delete(jobId);
  } catch (error) {
    console.error(`Error processing job ${jobId}:`, error);

    const currentJob = jobs.get(jobId);
    if (currentJob) {
      currentJob.status = 'failed';
      currentJob.error = error instanceof Error ? error.message : 'Unknown error';
      currentJob.completedAt = Date.now();
      jobs.set(jobId, currentJob);
    }

    jobProcessors.delete(jobId);
  }
}
