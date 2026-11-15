# Naija Dash closed beta playbook

Goal: 20 to 30 real players on real phones find what is broken **before** the public sees it. No new features during the beta, fixes only.

## 1. Before you invite anyone (about 30 minutes)
- [ ] Supabase SQL Editor: run `beta-v1.sql` (and `trust-v1.sql`, `admin-v2.sql` if not done yet).
- [ ] Upload the Batch 5 files to GitHub and wait for Cloudflare to redeploy.
- [ ] Rotate the Flutterwave keys that were pasted in a chat early on (if not done). Treat them as leaked.
- [ ] Admin > Settings: switch **Closed beta** ON and save. Leave maintenance mode OFF.
- [ ] Admin > Beta: add the invited emails.
- [ ] Open `app.naijadash.com` in a private window and test: guest play, sign-up, daily reward, one Classic Dash run, revive, challenges, feedback button.
- [ ] Email confirmation: **keep it OFF during the closed beta.** Supabase's built-in email sender only allows a handful of emails per hour, so confirmation emails would block sign-ups. Before public launch, set up your own email sender (for example Brevo or Resend with SMTP) and switch confirmation ON. Note that while it is OFF, someone could sign up with another person's invited email. That is acceptable for friends, not for launch.

## 2. Who to invite (aim for a mix)
- Phones: 5 cheap Android (Tecno, Infinix, Itel), 5 mid-range Android, 2 to 3 iPhones if you can.
- Networks: MTN, Airtel, Glo, plus some on Wi-Fi.
- People: friends who play games, and 3 to 5 who do not (they show you where new players get lost).
- Cities: not only Lagos.

## 3. WhatsApp invite message (copy and edit)
> Hi! I am building Naija Dash, a Nigerian driving game. Can you help me test it this week?
> 1. Open https://app.naijadash.com on your phone
> 2. Sign up with THIS email address (the one I invited): ____
> 3. Play for 10 minutes, then tap "Send feedback" in the menu and tell me what felt good or bad. Please include your phone model.
> Thank you! This is a private test, so please do not share the link yet.

## 4. Test tasks for players (send on day 2)
1. Play 3 Classic Dash runs. Did the controls feel right?
2. Crash and try Revive. Did it make sense?
3. Claim the daily reward and open "Daily challenges".
4. Choose a public name in Profile and settings.
5. Start the ranked circuit and play at least 5 stages. Tell us how long each stage felt and if anything confused you.
6. Switch off Wi-Fi for 30 seconds in the middle of a stage, then switch it on again. Did the game recover?
7. Share a score to WhatsApp.

## 5. What to watch in the admin (10 minutes a day)
- **Home:** feedback waiting, errors in 24h, ranked runs and anything needing review.
- **Tournament:** approve or reject flagged runs. Check seconds per stage: many stages under 6 seconds means a script or a connection backlog.
- **Beta tab:** read feedback (mark Done when handled), and look at the error table. An error seen on 3 or more phones is a priority.
- Reply to every tester on WhatsApp within a day. Fast replies keep testers testing.

## 6. When is the beta "done"? (exit rules)
- At least 70 percent of invited people signed up.
- At least half of them finished a full ranked circuit.
- No error is reported by 3 or more phones without a fix.
- No open "game is broken" feedback older than 2 days.
- Cheapest phone in the group plays Classic Dash without freezing (use Low graphics if needed and note it).
- You approved or rejected every flagged run, and none looked like a real bug in the scoring.

## 7. Ground rules during the beta
- Do not promise prizes or money. Say "test" clearly.
- Do not collect bank details, phone numbers or ID in the game or the feedback form.
- Tell testers the game stores their email, game progress and anonymous device and error data (your Privacy page should say the same).
- Fix only what testers hit. Write new ideas in a list for after launch.

## 8. After the beta
Switch Closed beta OFF only when you are ready for the public (Batch 6): your own email sender is set, payments are tested (if you use them), and the Privacy and Terms pages match what the game really does.
