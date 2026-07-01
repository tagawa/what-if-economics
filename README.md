# what if… economics

An interactive economics simulator. Nudge a macroeconomic factor, interest rate, inflation, unemployment, etc., and watch the change ripple through the factors it's linked to. The goal is to understand economic relationships without needing any background knowledge.

## Use it

**[Open what if… economics](https://whatifeconomics.com)**

Runs in the browser, nothing to install. Works on phones and older devices too.

## Features

- Adjust any factor up or down and see its knock-on effects settle a moment later.
- Preset scenarios (rate hike, recession, stimulus, and more) for one-click exploration.
- Beginner Mode, which trims the view to five core factors and hides scenarios whose triggers aren't shown.
- English and Japanese, switchable at runtime or via a `?lang=` link.

## For developers

Most people won't need this section. If you want to run or hack on it:

The app loads its data with `fetch()`, which browsers block on `file://` URLs, so it needs to be served over HTTP. Any static server works:

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

Run the tests with `npm test` (Node's built-in runner, nothing to install; tested on Node v25).

No build step, no dependencies, no framework. The shipped JavaScript is written to an ES2017 syntax floor so it runs on older and low-end devices.

## Licence

[MIT](LICENSE).
