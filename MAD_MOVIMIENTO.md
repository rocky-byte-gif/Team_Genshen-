# MAD MOVIMIENTO — added to the Motion-RUSH engine

Run: `npm install` then `npm run dev` (http://localhost:5173). Menu → **Mad Movimiento** (first tile).

## Controls (body)
| Action | Gesture |
|---|---|
| Run to the combat spot | Jog in place |
| Peek | Lean left / right (~0.3 shoulder widths) |
| Take cover + reload | Crouch |
| Aim | Move your raised hand |
| Knife | Slash with arm |
| Pistol / Desert Eagle | Finger gun, flick wrist up |
| Rifle / Automatic | Both hands together at chest/shoulder (auto = faster fire) |
| Sniper | Raise hand to eye, hold still until the ring fills |
| Bomb | Hand above head, then throw down hard |
| Rocket | Rest hand on shoulder until loaded, then push forward |

Keyboard/mouse fallback (testing without a camera): W run · A/D peek · S crouch · Shift hold-fire pose · E scope charge · mouse aim + click fire.

## Where things live
- `src/features/mad/weapons.ts`   weapon stats and gesture text
- `src/features/mad/levels.ts`    8 missions (enemies, timing, theme, map position)
- `src/features/mad/madInput.ts`  pose → run / peek / crouch / aim / weapon triggers (all thresholds in `T`)
- `src/features/mad/MadGame.ts`   game rules, enemy AI, damage, rating (S/A/B/C)
- `src/features/mad/MadScene.ts`  three.js scene (sky, shadows, bloom, particles, enemies)
- `src/features/mad/sceneKit.ts`  textures, particles, soldier + weapon models
- `src/screens/mad/`              campaign map, briefing, HUD, results
- Patched: `modes.ts`, `flow.ts`, `App.tsx`, `MenuScreen.tsx`, `modeArt.ts`, `index.html`, `base.css`
