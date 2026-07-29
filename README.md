# Screen Share

Click "Start Sharing," get a link, send it to one friend — they open it and watch your screen (with audio, on Chrome/Edge/Windows). No accounts, no installs.

## How it works

- The video/audio never touches this server — it flows directly between the two browsers over WebRTC (peer-to-peer).
- The server's only job is "signaling": handing out a random room link, and briefly relaying the connection setup messages between host and viewer so their browsers can find each other. Once connected, the server is out of the picture.
- STUN (a free public Google server) helps both sides discover their own public address. When that's not enough to connect directly — common across different countries/ISPs — a TURN relay is used as a fallback so the call still goes through (routed through the relay instead of failing).

## Run it locally

```bash
npm install
npm start
```

Open `http://localhost:3000` in one tab (host), click Start Sharing, then open the printed `http://localhost:3000/watch/<roomId>` link in a second tab (viewer).

## Setting up a TURN relay (recommended before sharing with people abroad)

Without TURN, sharing will often still work between people on typical home networks, but it can fail to connect for some NAT/firewall combinations — which is exactly the case you care about (Argentina/Italy). To fix that:

1. Sign up for a free account at the [Metered Open Relay Project](https://www.metered.ca/tools/openrelay/) (or any TURN provider — Twilio and Xirsys also have free tiers).
2. They'll give you a TURN URL, username, and credential.
3. Set these as environment variables wherever you run the server:
   ```bash
   TURN_URL=turn:your-turn-host:80,turn:your-turn-host:443?transport=tcp
   TURN_USERNAME=your-username
   TURN_CREDENTIAL=your-credential
   ```
4. Restart the server — `/api/ice-servers` will now include your TURN server automatically, no code changes needed.

Without these set, the app still runs fine on STUN alone — it'll just be less reliable across very restrictive networks.

## Deploying (Render.com free tier)

HTTPS is required for screen capture to work at all in the browser, so this needs to be deployed somewhere with HTTPS rather than opened as a local file.

1. Create a free account at [render.com](https://render.com).
2. Push this project to a GitHub repo (or use Render's "deploy without git" option and upload the folder directly).
3. In Render, click **New +** → **Web Service**, connect the repo.
4. Settings:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Instance type:** Free
5. Add the `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` environment variables from the section above under the service's **Environment** tab.
6. Deploy. Render gives you a public URL like `https://your-app.onrender.com` — that's the link you'll share, e.g. `https://your-app.onrender.com` for the host page.

Note: Render's free tier spins the service down after inactivity and takes a few seconds to wake up on the next visit — fine for occasional personal use.

## Known limitations

- **One viewer per share.** A second person opening the link while someone is already watching will get a "this share already has a viewer" message.
- **System audio capture is Chrome/Edge-on-Windows only.** On macOS or Firefox, only the screen video will come through — audio capture for the full desktop isn't supported by those browsers via `getDisplayMedia`.
- **No reconnect-on-refresh.** If the viewer refreshes, they rejoin the same room fine (as long as they haven't been replaced), but the host has to still be actively sharing.
- **Rooms are in-memory.** Restarting the server drops all active rooms/links.
