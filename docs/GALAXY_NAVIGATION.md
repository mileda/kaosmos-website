# Galaxy navigation

Branch: `feat/galaxy-navigation`

Run `python3 -m http.server 8000` in the repository and open http://localhost:8000.

- Drag the universe to explore. Pinch or use +/- to change viewing distance.
- Click a destination or the atlas to fly into its photograph. The same image expands continuously into a full-screen chapter. Escape / Back to universe reverses the journey.
- Scrolling over the universe begins approaching the closest destination. Further scroll advances or reverses the approach. Once arrived, scrolling reads the chapter normally.
- Live has a pinned three-photo sequence, with crossfades tied to scroll position. Continue buttons move between chapters.
- Hash links and browser back navigation are supported. `classic.html` retains the previous experience, including sound and Attic.
- Reduced-motion users get immediate destination transitions and a stacked live-photo sequence.

## Implementation

Canvas 2D perspective stars plus a generated galaxy texture; this is not a volumetric WebGL renderer. Rendering sleeps when the camera is stationary or the page is hidden. Destination images and HTML content stay in the DOM; native dialog focus containment is retained, but the visual presentation is edge-to-edge, not a floating modal.

The galaxy texture `img/universe/galaxy.webp` is an original AI-generated asset, encoded as WebP (~248 KB). Generation brief: realistic astronomical photography aesthetic, inclined spiral galaxy, ivory nucleus, charcoal dust lanes, muted rust emission nebula and desaturated blue arms, dark edges, no text or spacecraft. Generated using the built-in image tool. Pear's public scroll experience was observed for interaction inspiration; no Pear assets or code were copied.

## Verification

- `node --check universe.js` and `git diff --check`.
- Browser: destination opening, releases content, live direct hash, Live sequence progressing to the second photograph, exit back to universe.
- 390px iframe layout inspected; destination positions adjusted to avoid the central wordmark, Contact opening checked. This is responsive layout QA, not a physical-device touch test.

Still to validate on hardware: touch pinch gestures, iOS Safari behavior, reduced-motion OS preference, and low-end GPU/frame-time measurements. Classic Attic/sound are not integrated into the galaxy yet.
