# Influencer Outreach Engine - Architecture, Trade-Offs, and Next Steps

This document outlines the architectural decisions, trade-offs, shortcuts, and future scaling strategies for the Influencer Outreach Engine MVP.

---

## 1. Architectural Approach and Trade-Offs

### Monolithic Architecture
A monolithic structure (Next.js App Router with Server Actions) was selected for this project. 
- **Rationale**: For an MVP focused on core functionalities (sending emails, configuring templates, and reviewing database logs), a monolith minimizes infrastructure overhead, simplifies state management, and enables rapid end-to-end development.
- **Trade-Off**: Scaling individual components (such as the email-sending worker) independently is not possible without refactoring to a microservices or queue-based design.

### SMTP Sandboxing via Mailpit
Instead of integrating a live Gmail/Google OAuth connection, a sandboxed SMTP server (Mailpit) was used for email delivery.
- **Rationale**: Real-world Google integration requires OAuth consent screen verification, domain configuration, and credentials management, introducing significant setup friction for external reviewers. Using Mailpit allows reviewers to test the entire sending and logging lifecycle locally with zero-friction configuration.
- **Trade-Off**: Real email delivery is simulated rather than performed. Real-world delivery requires managing SPF, DKIM, DMARC records, and credential authorization.

---

## 2. Shortcuts Taken

- **Direct Database Writes in Server Actions**: The application writes log entries to PostgreSQL directly from Next.js Server Actions during the request-response lifecycle. In a production system, these should be handled asynchronously via a background task queue to prevent blocking client requests and avoid exhausting database connection pools.
- **Client-Side Templating and State**: Template compilation is executed client-side before sending data to the server. While sufficient for small batches, this should ideally be moved server-side to maintain data integrity and reduce payload size.

---

## 3. What Would Break First at Scale
At a load of **10,000 influencers and 100 brands**, the system would encounter several immediate bottlenecks:

### Network and Serverless Execution Timeouts
- **Sequential Mode**: With a 500ms delay per email, sending 10,000 emails would take over 83 minutes. This would immediately violate the execution limits of serverless platforms (e.g., Vercel's 10-second to 60-second timeouts for serverless functions).
- **Burst Mode**: Sending 10,000 requests concurrently would exhaust network sockets, hit SMTP rate limits, and crash the Node.js runtime due to memory exhaustion.

### Database Connection Exhaustion
Under a high volume of concurrent sends, 10,000 write operations executed directly from Server Actions would instantly exhaust the PostgreSQL database connection pool, leading to connection timeouts and query failures.

### Frontend DOM Rendering Limits
Rendering 10,000 table rows without virtualization (e.g., react-window) causes significant browser main-thread lag, resulting in an unresponsive UI.

---

## 4. Next Steps for a Production-Grade Product

If this were developed into a commercial product, the following systems would be implemented:

### Asynchronous Queue System
Decouple email sending from the HTTP request-response cycle. Utilizing a queue system (such as BullMQ with Redis, or AWS SQS):
- Prevents timeout issues by processing sending operations in the background.
- Ensures resilience: if a worker crashes or restarts, the queue retains the state and resumes from the last successfully sent index.
- Enables throttling to strictly adhere to SMTP provider rate limits.

### Production Email Service
Transition from the local mock SMTP server to **AWS Simple Email Service (SES)**:
- Provides high deliverability, dedicated IP options, and built-in handling for bounces, complaints, and spam reports.
- Integrates with domain validation protocols (SPF, DKIM) to maintain brand email reputation.

### Database Optimization
Implement connection pooling (using tools like PgBouncer or serverless-friendly connection managers like Prisma Accelerate) and optimize indexing on query filters to manage high concurrent read and write connections.
