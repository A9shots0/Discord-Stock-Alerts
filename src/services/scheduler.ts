import { Client, TextChannel } from 'discord.js';

type ScheduledTask = {
  id: string;
  cronExpression: string;
  task: () => Promise<void>;
  nextRun: Date | null;
};

class Scheduler {
  private tasks: Map<string, ScheduledTask> = new Map();
  private intervalId: NodeJS.Timeout | null = null;
  private client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  /**
   * Schedule a task to run at a specific time
   * @param id Unique identifier for the task
   * @param hour Hour in 24-hour format (0-23)
   * @param minute Minute (0-59)
   * @param task The task function to run
   */
  scheduleDaily(id: string, hour: number, minute: number, task: () => Promise<void>): void {
    // Create a Date object for the next run
    const nextRun = this.getNextRunTime(hour, minute);
    
    const scheduledTask: ScheduledTask = {
      id,
      cronExpression: `${minute} ${hour} * * *`, // Daily at specified time
      task,
      nextRun
    };

    this.tasks.set(id, scheduledTask);
    console.log(`Scheduled task ${id} to run daily at ${hour}:${minute.toString().padStart(2, '0')} (next run: ${nextRun.toLocaleString()})`);
  }

  /**
   * Start the scheduler
   */
  start(): void {
    // Check every minute for tasks that need to run
    this.intervalId = setInterval(() => this.checkTasks(), 60000);
    console.log('Scheduler started');
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('Scheduler stopped');
    }
  }

  /**
   * Check if any tasks need to run
   */
  private async checkTasks(): Promise<void> {
    const now = new Date();

    for (const [id, task] of this.tasks.entries()) {
      if (task.nextRun && now >= task.nextRun) {
        console.log(`Running task ${id}`);
        
        try {
          await task.task();
        } catch (error) {
          console.error(`Error running task ${id}:`, error);
        }

        // Update next run time
        const [hour, minute] = task.cronExpression.split(' ').map(Number);
        task.nextRun = this.getNextRunTime(hour, minute);
        
        console.log(`Next run of task ${id}: ${task.nextRun.toLocaleString()}`);
      }
    }
  }

  /**
   * Calculate the next run time for a daily task
   */
  private getNextRunTime(hour: number, minute: number): Date {
    const now = new Date();
    const nextRun = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      hour,
      minute,
      0
    );

    // If the time has already passed today, schedule for tomorrow
    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1);
    }

    return nextRun;
  }
}

export default Scheduler; 