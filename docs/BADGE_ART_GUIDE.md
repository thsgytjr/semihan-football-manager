# Badge Art Guide (DALL·E Workflow)

## 1. Visual Direction (Modern Illustrated Medals)
- **Overall vibe**: Apple Fitness-esque ring + enamel core, but center is a minimal illustration that literally depicts the badge title (예: "해트트릭 히어로" → 3개의 공이 꼬리를 그리며 날아가는 장면).
- **Shape**: Perfect circle, shallow bevel, dual ring (outer brushed metal, inner ceramic disk) so illustrations sit inside a defined frame.
- **Illustration style**: Clean vector or stylized 3D flat illustration with smooth gradients, soft shadows, and limited color palette (3~4 tones). No photoreal elements.
- **Background**: Transparent PNG preferred. If DALL·E insists on a background, use matte #080808 then remove background with remove.bg.
- **Resolution**: 1024×1024 PNG. Leave ~8% padding to prevent clipping.
- **Text**: Do not render lettering or numbers inside the image; the UI will handle labels.

### Tier Color Mapping
| Tier | Label | Ring Hue | Core Hue |
| --- | --- | --- | --- |
| 4 | Platinum | #d1d5db → #f8fafc | #f9fafb → #e5e7eb |
| 3 | Gold | #fbbf24 → #f59e0b | #fff7e6 → #fde68a |
| 2 | Silver | #9ca3af → #e5e7eb | #f3f4f6 → #d1d5db |
| 1 | Bronze | #b45309 → #f97316 | #fef3c7 → #fcd34d |

### Category Accents
| Category | Motif | Accent Guidance |
| --- | --- | --- |
| Goals (득점) | stylized football trajectory, energy arc | subtle orange flare (#fb923c) |
| Assists (도움) | target + arrow, passing ribbon | violet/indigo glow (#7c3aed) |
| Appearances (출전) | shield, calendar ticks | cyan streaks (#0ea5e9) |
| Defense (수비) | gloves, barrier, clean sheet icon | emerald veins (#10b981) |
| Special (스페셜) | comet trail, starburst | pink/magenta accents (#ec4899) |

> Tip: mention "minimal, modern sports medal" in every prompt to keep branding consistent.

### Badge Title Motifs
| Badge Title | Storyboard idea |
| --- | --- |
| 골 머신 | Three blazing footballs orbiting the center ring like electrons |
| 도움 장인 | Passing arc ribbon linking two minimalist players |
| 포인트 헌터 | Trophy silhouette filled with layered goal/assist icons |
| 아이언맨 | Calendar shield with highlighted streak of dates |
| 클린시트 가디언 | Goalkeeper gloves forming a barrier in front of a net |
| 첫 골 신고식 | Single golden ball breaking through confetti |
| 해트트릭 히어로 | Triple goal trail spiraling upward |
| 멀티골 콜렉터 | Stack of football badges stacked diagonally |
| 플레이메이커 나이트 | Night sky gradient with neon passing lanes |
| 꾸준한 스나이퍼 | Target bullseye with dotted path hitting center repeatedly |
| 출석체크 달인 | Attendance punch card with glowing check marks |

## 2. DALL·E Prompt Recipes
Use the template then swap **{title}**, **{story element}**, **{accent color}**, and **{tier label}** (Platinum/Gold/Silver/Bronze). Generate at least two variations per badge to keep a backup.

```
Modern illustrated sports medal, Apple Fitness inspired outer ring, {tier label} metallic rim, {story element} inside on enamel disk, clean vector gradients, soft lighting, transparent background, no text, ultra high detail, 1024x1024
```

### Category-specific inserts
| Category | Accent text suggestion | Icon hint |
| --- | --- | --- |
| Goals | "fiery orange energy arc" | "sleek football path" |
| Assists | "violet ribbon trail" | "precision target with arrow" |
| Appearances | "cyan pulse" | "shield with tally marks" |
| Defense | "emerald barrier aura" | "goalkeeper gloves" |
| Special | "magenta comet trail" | "starburst" |

### Example prompts (직접 사용 가능)
1. **골 머신 · Platinum**  
	`Modern illustrated sports medal, Apple Fitness inspired outer ring, platinum metallic rim, three blazing footballs looping in an orange energy arc to depict Hat Trick machine, clean vector gradients, soft lighting, transparent background, no text, ultra high detail, 1024x1024`

2. **도움 장인 · Gold**  
	`Modern illustrated sports medal, Apple Fitness inspired outer ring, gold metallic rim, violet ribbon pass connecting two minimalist players with target icon, assists master theme, clean vector gradients, transparent background, no text, ultra high detail`

3. **아이언맨 · Silver**  
	`Modern illustrated sports medal with silver rim, cyan attendance calendar shield showing glowing streak of consecutive days, ironman durability vibe, flat illustration, soft studio lighting, transparent background, 1024x1024`

4. **클린시트 가디언 · Gold**  
	`Modern illustrated sports medal with gold rim, emerald goalkeeper gloves forming barrier in front of stylized net, clean sheet guardian story, glossy enamel core, transparent background`

5. **해트트릭 히어로 · Bronze**  
	`Modern illustrated sports medal with bronze rim, triple football trails spiraling upward like hero crest, magenta comet highlights, transparent background`

## 3. Integrating the Assets
1. **Export**: Download each DALL·E result as PNG (transparent). Rename following pattern: `public/badges/<category>-<tier>.png` (e.g., `public/badges/goals-platinum.png`).
2. **Metadata mapping**: extend the badge data to include `iconSrc`, e.g. in `playerBadgeEngine` or Supabase definitions:
	```js
	iconSrc: `/badges/goals-platinum.png`
	```
3. **Component update**: in `BadgeIcon.jsx`, check `badge.iconSrc` and render an `<img>` inside the medal core instead of numeric text when available. Fallback to gradient-only style if not provided.
4. **Layout tweaks**:
	- Give the image a fixed 56–64px circle with `object-fit: contain` so illustrated scenes stay intact.
	- When `iconSrc` exists, hide the numeric chip and instead show tier text underneath (already supported by `BadgeIcon`).
	- Consider adding a subtle glass overlay (`bg-white/5`) behind the PNG to blend edges.
5. **Caching**: import via Vite static path (`new URL('../assets/...', import.meta.url)`) if you prefer fingerprinting, otherwise keep under `public/` for Supabase-hosted CDN.
6. **Dark-mode preview**: confirm exported PNG edges are feathered (no white fringe). If needed, run through TinyPNG or Squoosh before committing.
