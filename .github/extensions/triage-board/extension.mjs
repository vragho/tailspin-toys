import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { joinSession, createCanvas } from "@github/copilot-sdk/extension";

const execFileAsync = promisify(execFile);
const servers = new Map();

async function loadIssues() {
    const { stdout } = await execFileAsync("gh", [
        "issue", "list", "--repo", "vragho/tailspin-toys", "--state", "open",
        "--limit", "30", "--json", "number,title,body,labels,assignees,updatedAt,url",
    ]);
    return JSON.parse(stdout);
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function issueDescription(issue) {
    return issue.body?.trim().split("\n").filter(Boolean)[0] ?? "No description provided.";
}

function justification(number) {
    return {
        6: "Pagination is a foundational catalog improvement that can reduce page weight and make later browsing features easier to use.",
        1: "Search addresses the fastest path for users who already know what they want and complements the recently shipped filters.",
        2: "Sorting gives backers control over catalog exploration and builds directly on the existing title and rating data.",
    }[number] ?? "This is the next open catalog improvement after the highest-priority work.";
}

function issueCard(issue, featured) {
    const labels = (issue.labels ?? []).map((label) => label.name).join(", ");
    return `<article class="card ${featured ? "featured" : ""}">
      <div class="card-top"><span class="issue-number">#${escapeHtml(issue.number)}</span><span class="updated">Updated ${escapeHtml(new Date(issue.updatedAt).toLocaleDateString())}</span></div>
      <h3>${escapeHtml(issue.title)}</h3><p>${escapeHtml(issueDescription(issue))}</p>
      ${featured ? `<p class="why"><strong>Why now:</strong> ${escapeHtml(justification(issue.number))}</p>` : ""}
      ${labels ? `<p class="labels">${escapeHtml(labels)}</p>` : ""}
      <button data-issue="${escapeHtml(issue.number)}">Add to current context</button>
    </article>`;
}

function renderHtml(issues, message = "") {
    const priorityNumbers = [6, 1, 2];
    const featured = priorityNumbers
        .map((number) => issues.find((issue) => issue.number === number))
        .filter(Boolean);
    const remainder = issues.filter((issue) => !priorityNumbers.includes(issue.number));
    return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Issue triage board</title>
<style>
:root{color-scheme:light dark}body{margin:0;padding:24px;background:var(--background-color-default,#fff);color:var(--text-color-default,#1f2328);font:14px/1.5 var(--font-sans,system-ui,sans-serif)}h1,h2,h3{line-height:1.2}h1{margin:0 0 6px;font-size:24px}h2{margin:26px 0 12px;font-size:17px}.muted{color:var(--text-color-muted,#656d76);margin:0 0 20px}.board{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}.card{border:1px solid var(--border-color-default,#d0d7de);border-radius:10px;padding:16px;background:var(--background-color-default,#fff)}.featured{border-color:var(--true-color-blue,#0969da);box-shadow:0 0 0 1px var(--true-color-blue,#0969da)}.card-top{display:flex;justify-content:space-between;gap:8px;color:var(--text-color-muted,#656d76);font-size:12px}.issue-number{color:var(--true-color-blue,#0969da);font-weight:600}h3{margin:10px 0 8px;font-size:16px}p{margin:8px 0}.why{padding:9px;border-left:3px solid var(--true-color-blue,#0969da);background:var(--background-color-muted,#f6f8fa)}.labels{color:var(--text-color-muted,#656d76);font-size:12px}button{margin-top:12px;border:1px solid var(--border-color-default,#d0d7de);border-radius:6px;padding:7px 10px;color:var(--text-color-default,#1f2328);background:var(--background-color-default,#fff);cursor:pointer}button:hover{background:var(--background-color-muted,#f6f8fa)}button:focus-visible{outline:2px solid var(--color-focus-outline,#0969da);outline-offset:2px}#message{min-height:20px;color:var(--true-color-green,#1a7f37)}
</style></head><body>
<h1>Open issue triage</h1><p class="muted">Three issues are highlighted based on urgency, user impact, and how directly they build on the current catalog work.</p>
<p id="message" role="status" aria-live="polite">${escapeHtml(message)}</p>
<h2>Most likely to need attention now</h2><section class="board" aria-label="Priority issues">${featured.map((issue) => issueCard(issue, true)).join("")}</section>
<h2>Other open issues</h2><section class="board" aria-label="Other issues">${remainder.map((issue) => issueCard(issue, false)).join("") || "<p class='muted'>No other open issues.</p>"}</section>
<script>
document.querySelectorAll("button[data-issue]").forEach((button)=>button.addEventListener("click",async()=>{button.disabled=true;const response=await fetch("/add-to-context",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({number:button.dataset.issue})});const result=await response.json();document.querySelector("#message").textContent=result.message||result.error;button.disabled=false;}));
</script></body></html>`;
}

async function startServer(session, issues) {
    const server = createServer(async (req, res) => {
        if (req.method === "POST" && req.url === "/add-to-context") {
            let body = "";
            for await (const chunk of req) body += chunk;
            try {
                const { number } = JSON.parse(body);
                const issue = issues.find((item) => String(item.number) === String(number));
                if (!issue) throw new Error("Issue is no longer open.");
                await session.send({ prompt: `Add GitHub issue #${issue.number} to the current context and prepare to work on it:\n\nTitle: ${issue.title}\n\n${issue.body ?? ""}` });
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ message: `Issue #${issue.number} added to the current context.` }));
            } catch (error) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: error.message }));
            }
            return;
        }
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(renderHtml(issues));
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    return { server, url: `http://127.0.0.1:${port}/` };
}

const session = await joinSession({
    canvases: [createCanvas({
        id: "triage-board",
        displayName: "Issue triage board",
        description: "A Kanban board for triaging open repository issues, with context actions.",
        actions: [{
            name: "refresh_issues",
            description: "Refresh the board from the repository's current open issues.",
            handler: async () => {
                const issues = await loadIssues();
                return { issueCount: issues.length, issues };
            },
        }],
        open: async (ctx) => {
            let entry = servers.get(ctx.instanceId);
            if (!entry) {
                const issues = await loadIssues();
                entry = await startServer(session, issues);
                servers.set(ctx.instanceId, entry);
            }
            return { title: "Issue triage board", url: entry.url };
        },
        onClose: async (ctx) => {
            const entry = servers.get(ctx.instanceId);
            if (entry) {
                servers.delete(ctx.instanceId);
                await new Promise((resolve) => entry.server.close(() => resolve()));
            }
        },
    })],
});
