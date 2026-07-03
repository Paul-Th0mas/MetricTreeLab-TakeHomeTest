# Developer Notes: Decisions, Shortcuts, & Scaling Trade-offs

This sheet covers the reality of how the outreach engine is built, where I took shortcuts to get this MVP out the door, and what will break first when we start scaling.

---

## Why I Built It This Way

### Monolithic Next.js + Server Actions
I went with a single monolithic Next.js repository using Server Actions (`app/actions/outreach.ts`) to handle the backend work. 
- **The Good:** For an MVP, keeping everything in one place makes it super fast to build and reason about. State sharing is simple, deployment is a one-click affair, and I didn't have to manage separate service repositories for sending and logging.
- **The Bad:** We can't scale the email sender independently. If the frontend gets quiet but the sending worker is slammed, they still share the same server resources.

### Mailpit Sandbox instead of Real SMTP
Rather than dealing with Google OAuth consent screens, domain validation, and SMTP credential setup right away, I set up Mailpit as a local mock SMTP receiver.
- **The Good:** Reviewers can test the whole sending and logging cycle locally with zero-friction configuration. Just point Nodemailer to `localhost:1025` and inspect the emails at port `8025`.
- **The Bad:** It's a simulated environment. Moving to production requires a proper production mail service and dealing with SPF, DKIM, and email reputations.

---

## Shortcuts Taken (To Ship Quickly)

- **Writing directly to PostgreSQL in Server Actions**: Every time we send an email in `sendOutreachEmail` (`lib/mailer.ts`), we immediately await `prisma.emailLog.create()`. Doing database writes synchronously in the request path is fine for a few rows, but in production, this blocks the execution thread and will quickly exhaust the connection pool under load.
- **Compiling templates on the client-side**: Right now, the page compiles template placeholders (like `{{Name}}` and `{{Brand}}`) directly in React before invoking the server action. For small lists, this is fine, but formatting and compiling should really happen server-side to prevent payload bloating and ensure data integrity.
- **Single-Host Docker Compose Topology**: We packaged the Next.js web application, PostgreSQL database, and Mailpit SMTP server into a single `docker-compose.yml` stack. While this is ideal for zero-friction local setups and single-host VPS deployments, a production-grade container architecture would decouple these services—using managed databases, dedicated container tasks (e.g., ECS/Kubernetes), and isolated worker processes.

---

## What Will Blow Up First at Scale?

If we try to run this with **10,000 influencers and 100 brands**, we will run into three immediate walls:

### 1. HTTP & Gateway Connection Timeouts
* **Sequential Mode**: We wait 500ms between each email to be polite. Sending 10,000 emails sequentially would take about 1.4 hours. Standard web browsers, reverse proxies (like Nginx), and Node.js servers will hard-timeout long-running HTTP requests (often after 30 to 120 seconds), terminating the Server Action process mid-run.
* **Burst Mode**: If we trigger 10,000 emails concurrently (`Promise.all`), we will immediately exhaust server memory, run out of open sockets, and likely get throttled/blocked by our SMTP provider.

### 2. Database Connection Pool Exhaustion
Every server action run spins up database connection queries. Under heavy concurrency (e.g. Burst Mode), 10,000 simultaneous writes will exceed the database's max connection limits, throwing immediate connection timeout errors.

### 3. Frontend Rendering Lag
The influencer table doesn't use virtualization (like `react-window` or `react-virtualized`). Trying to render 10,000 rows in the DOM at once will freeze the browser's main thread and make the page completely unresponsive.

---

## What I'd Do Next for Production

If this becomes a commercial tool, here's what needs to be implemented:

1. **An Asynchronous Queue (BullMQ / SQS)**
   We need to move email sending out of the HTTP request lifecycle entirely. A user clicks "Send", we push a job to a queue (like Redis-backed BullMQ), and return a fast `202 Accepted` response. Background workers pick up the jobs, handle retries if SMTP fails, and respect provider rate limits (throttling).
   
2. **AWS SES (or similar production service)**
   Swap the local Mailpit config for a real provider like AWS SES. This handles SPF/DKIM verification, spam reputation, and hooks up webhooks to process bounces and complaints.

3. **Connection Pooling & Virtualization**
   Add PgBouncer or use Prisma Accelerate to handle database connections safely under heavy write loads, and use virtual lists to render only the visible table rows in the UI.

4. **Campaign Completion Notifications**
   Since large campaigns run asynchronously in the background, send a summary notification email to the user when the entire outreach run is complete, outlining key metrics (delivered count, failures, and bounces).

