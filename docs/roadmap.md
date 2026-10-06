# Roadmap

Future work, not scheduled yet. Newest first.

## Quick "New event" shortcut, agenda first, plan after

*Added 6 Oct 2026.*

Open the new-event chat in one tap or keypress. The event lands in your agenda straight away; the milestone plan follows.

- [ ] **Direct link** `aheadoftime.app/new`: opens the new-event chat with the cursor in the text box. Today `/events/new` opens the manual form, not the chat. *Small, about an hour.*
- [ ] **Phone**
  - Android: a "New event" shortcut in `public/site.webmanifest`, so a long-press on the installed app's icon opens `/new`.
  - iPhone: no long-press menu for web apps. Explain in How it works or the FAQ how to add `/new` to the home screen (Safari → Share → Add to Home Screen), or open it from an Apple Shortcut, the Action button or Back Tap. *Small.*
- [ ] **Desktop**
  - In the app: **N** or **Ctrl/Cmd + K** opens the new-event chat from any page, but not while typing in a field.
  - Installed app (Chrome/Edge): the same shortcut appears on a right-click of the taskbar or dock icon.
  - A key that works anywhere on the computer can't come from a website. Document the workaround: a Windows desktop shortcut with a shortcut key, or a macOS Shortcut with a keyboard shortcut, that opens `/new`. *Small.*
- [ ] **Agenda first, then the plan.** The chat saves the event right away (title, date, time) and confirms "Added to your agenda". The event reaches Google Calendar or the calendar feed like any other. Then it builds the milestone plan and asks the quick questions to refine it. Today the plan comes first and the event only exists after that. This changes the order inside the chat's planning flow (`src/components/ChatConsole.tsx`, `server/agentProcessor.ts`), so keep the title rules and the questions rules intact. *Medium, half a day to a day with testing. Make a mock-up of the chat first.*

Suggested order: link, phone and desktop shortcuts together; then "agenda first" as its own change.
