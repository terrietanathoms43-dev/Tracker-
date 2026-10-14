# Trackwise — Meeting notes assistant

**Location:** Projects → Meeting assistant (administrator and leader accounts only). You can also open it from **＋ Create → Review meeting notes**.

## Using the assistant
1. Upload a text-based PDF, Word `.docx`, `.txt`, `.md`, or `.csv` file, or paste the transcript into the notes box.
2. Review the extracted text. File text is extracted in the browser. Files are not uploaded to the database as meeting records.
3. Optionally check the consent box to send meeting text and relevant Tracker records to OpenAI **if** a server API key has been configured. Without this, Trackwise performs a **basic rules-based preview**, which is not AI. Both modes keep saving optional.
4. Select **Analyze meeting & compare with Trackwise**. The backend checks saved tasks, projects, goals, and active organization members.
5. Review the suggested **new tasks**, **changes to existing tasks**, **new projects**, **new goals**, and **already tracked** matches.
6. Edit dates, priority, owner, descriptions, and project links as needed. Mark the correct suggestions, then click **Approve & save**. Existing items are never changed unless you approve them.
7. Check Tasks / Projects / Goals to confirm the saved changes. Re-analyze after other people update your tracker.

## Privacy and limitations
- **No auto-save:** The meeting document and transcript text are not added to Trackwise's database by analyzing. Only approved suggestions become saved work records.
- **AI opt-in:** OpenAI receives only the extracted notes and relevant existing work (including display names of eligible members), and only if the AI consent box is checked and a key is configured. The basic rules preview uses Trackwise's own server, not an external language model.
- **Permissions:** Both API and database actions verify the signed-in user's organization membership. Administrators and leaders may create or update tasks; other members cannot approve AI suggestions.
- **Limits:** Up to 40,000 characters, 8 MB documents, 50 text-based PDF pages, and a capped number of saved records included in the comparison. Scanned/photographed pages without extractable text need to be transcribed first.
- **Conservative suggestions:** Review implied assignees, deadlines, and priorities; ambiguous dates remain blank. Exact existing titles are handled conservatively and may be marked already tracked.
- **Partial saves:** If an approved batch fails partway through, prior successfully saved updates stay saved; the interface marks them so you do not apply the same suggestion twice.
- **AI costs:** AI requests may consume paid OpenAI API credits. The server limits AI use to 10 analyses per organization member per day and 30 per organization. Basic previews require no OpenAI key or AI usage fees.

## Enabling actual AI analysis
Trackwise does not automatically inherit an OpenAI API key from other apps, ChatGPT, or this conversation. An administrator must explicitly supply their own API key through Vercel's secure environment-variable settings.

1. In Vercel, open the **tracker** project's **Settings → Environment Variables**.
2. Add a server-side secret called `OPENAI_API_KEY` (Production). **Do not** prefix it with `NEXT_PUBLIC_`, paste it in chat, or commit it to GitHub.
3. Optionally set `OPENAI_MODEL` to a supported model (default: `gpt-4.1-mini`). Confirm model access and any charges for your API account.
4. Redeploy the project to load the new server-side environment variable.
5. Check the consent box and analyze a harmless sample meeting transcript. You should see **AI meeting review**, not **Basic action-item preview**.

If API access is unavailable or the model request fails, the app explicitly labels the result as a **basic preview** rather than pretending it is AI-generated.

## Verification
Run `npm run lint`, `npm test`, and `npm run build`. Use an organization with disposable example tasks for end-to-end review. Check a duplicate task, an actual task update, a new project, and a new goal. Confirm no database changes occur before explicitly clicking **Approve & save**.
