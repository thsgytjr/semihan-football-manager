# 🚀 New Team Deployment Guide

Complete guide for setting up a new Football Manager app instance for a new team.

## 📋 Prerequisites

1. **Supabase Project**: Create a new project at [supabase.com](https://supabase.com)
2. **Project Credentials**: Note your project URL and anon key
3. **Git Repository**: Fork or clone this repository
4. **Node.js**: v18 or higher installed

## 🔧 Step-by-Step Setup

### 1. Database Setup

#### Run the Complete Setup Script

1. Open your Supabase project
2. Go to **SQL Editor**
3. Open `scripts/new-team-complete-setup.sql`
4. **Customize these values** (search & replace):
   - `NEWTEAM` → Your team's short name (e.g., `REDWINGS`, `TIGERS`)
   - `NewTeam Football Manager` → Your team's full name

5. **Run the entire script** in SQL Editor

#### What Gets Created:

**Core Tables:**
- ✅ `players` - Player roster with stats and photos
- ✅ `matches` - Historical match data
- ✅ `upcoming_matches` - Scheduled matches
- ✅ `appdb` - Configuration storage
- ✅ `visit_logs` - Analytics

**Settings Tables:**
- ✅ `settings` - App configuration
- ✅ `membership_settings` - Membership types

**Accounting Tables:**
- ✅ `payments` - Payment records
- ✅ `dues_settings` - Fee configuration
- ✅ `match_payments` - Per-match tracking

**Storage:**
- ✅ `player-photos` bucket (if storage schema exists)
- ✅ All RLS policies for security

### 2. Verify Database Setup

Run these queries in SQL Editor:

```sql
-- Check all tables
SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;

-- Check storage bucket
SELECT * FROM storage.buckets WHERE id='player-photos';

-- Check policies
SELECT tablename, policyname FROM pg_policies WHERE schemaname='public';
```

**Expected Output:**
- 10 tables in public schema
- 1 storage bucket: `player-photos`
- Multiple RLS policies per table

### 3. Manual Storage Bucket Setup (If Needed)

If the storage bucket wasn't created automatically:

1. Go to **Supabase Dashboard** > **Storage**
2. Click **New bucket**
3. Configure:
   - **Name**: `player-photos`
   - **Public bucket**: ✅ Yes
   - **File size limit**: 5MB
   - **Allowed MIME types**: `image/jpeg, image/png, image/webp, image/gif`

4. Add policies manually by running `scripts/storage-player-photos-setup.sql`

### 4. Code Configuration

#### Update Team Configuration

Edit `src/lib/teamConfig.js`:

```javascript
export const TEAM_CONFIG = {
  shortName: 'NEWTEAM',              // ← Your team's short name
  fullName: 'NewTeam Football',      // ← Your team's full name
  roomId: 'NEWTEAM-lite-room-1',     // ← Must match database room_id
  colors: {
    primary: '#3b82f6',              // ← Customize colors
    secondary: '#1e40af',
  }
}
```

#### Update Environment Variables

Create `.env.local` file in the project root:

```bash
# Supabase Connection (Required)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# Team Branding (Required)
VITE_TEAM_NAME="NewTeam FC"
VITE_TEAM_SHORT_NAME="newteam"
VITE_TEAM_PRIMARY_COLOR="#3b82f6"

# App Metadata (Required for production)
VITE_APP_DESCRIPTION="Plan. Play. Win. | NewTeam Football Manager"
VITE_APP_URL="https://newteam-fm.vercel.app"

# Feature Toggles (Optional - defaults to true)
VITE_FEATURE_ANALYTICS=true
VITE_FEATURE_DRAFT=true
VITE_FEATURE_UPCOMING=true
```

**Get Supabase values from:**
1. Go to **Supabase Dashboard** > **Settings** > **API**
2. Copy `Project URL` → `VITE_SUPABASE_URL`
3. Copy `anon public` key → `VITE_SUPABASE_ANON_KEY`

**Important Notes:**
- `.env.local` is for **local development only** (git-ignored)
- For **production**, add these to Vercel (see deployment section below)

#### Update package.json

Edit `package.json`:

```json
{
  "name": "newteam-football-manager",
  "version": "1.0.0",
  "description": "NewTeam Football Manager"
}
```

### 5. Install Dependencies

```bash
npm install
```

### 6. Run Development Server

```bash
npm run dev
```

Visit `http://localhost:5173` to see your app!

### 7. Test Core Features

#### As Admin (Login Required)

1. **Login**: Click profile icon > Login with Supabase
2. **Add Players**: Go to Players page > Add Player
   - Upload a photo to test storage
3. **Create Match**: Go to Match Planner
   - Select players
   - Assign teams
   - Save match
4. **Verify Data**: Check Dashboard for stats

#### Verify Database

```sql
-- Check players were created
SELECT id, name, photo_url FROM players;

-- Check matches were saved
SELECT id, "dateISO", "attendeeIds" FROM matches;

-- Check storage files
SELECT * FROM storage.objects WHERE bucket_id = 'player-photos';
```

### 8. Deploy to Production

#### Option A: Vercel (Recommended) ⭐

**Step 1: Prepare Repository**
```bash
# Commit all changes
git add .
git commit -m "Setup NewTeam Football Manager"
git push origin main
```

**Step 2: Create Vercel Project**
1. Go to [vercel.com](https://vercel.com) and login
2. Click **Add New** > **Project**
3. Import your GitHub repository
4. Configure project:
   - **Framework Preset**: Vite (auto-detected)
   - **Root Directory**: `./` (leave default)
   - **Build Command**: `npm run build` (auto-detected)
   - **Output Directory**: `dist` (auto-detected)

**Step 3: Add Environment Variables**

Click **Environment Variables** and add ALL of these:

```bash
# Supabase Connection (REQUIRED)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# Team Branding (REQUIRED)
VITE_TEAM_NAME=NewTeam FC
VITE_TEAM_SHORT_NAME=newteam
VITE_TEAM_PRIMARY_COLOR=#3b82f6

# App Metadata (REQUIRED for SEO/OG)
VITE_APP_DESCRIPTION=Plan. Play. Win. | NewTeam Football Manager
VITE_APP_URL=https://newteam-fm.vercel.app

# Feature Toggles (OPTIONAL - defaults to true)
VITE_FEATURE_ANALYTICS=true
VITE_FEATURE_DRAFT=true
VITE_FEATURE_UPCOMING=true
```

**⚠️ Critical Notes:**
- Add to **all environments**: Production, Preview, Development
- Use **exact** Vercel domain for `VITE_APP_URL` (e.g., `newteam-fm.vercel.app`)
- No quotes needed in Vercel environment variables UI
- Double-check Supabase URL and key have no extra spaces

**Step 4: Deploy**
1. Click **Deploy**
2. Wait for build to complete (~2-3 minutes)
3. Visit your deployment URL
4. Verify:
   - ✅ App loads without errors
   - ✅ Login works
   - ✅ Can add players
   - ✅ Can create matches

**Step 5: Custom Domain (Optional)**
1. In Vercel project: **Settings** > **Domains**
2. Add your domain (e.g., `newteam.football`)
3. Update DNS records as instructed
4. Update `VITE_APP_URL` to match custom domain
5. Redeploy

**Troubleshooting Vercel Deployments:**

| Issue | Solution |
|-------|----------|
| Build fails with "VITE_SUPABASE_URL is not defined" | Check env vars are added to all environments |
| App loads but blank screen | Check browser console, likely missing env var |
| Login doesn't work | Verify Supabase URL/key are correct, check Supabase auth settings |
| OG image not showing | Ensure `VITE_APP_URL` matches actual deployed URL |
| Features missing | Check `VITE_FEATURE_*` variables are set to `true` |

---

#### Option B: Netlify

**Step 1: Build**
```bash
npm run build
```

**Step 2: Deploy**
```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login
netlify login

# Deploy
netlify deploy --prod --dir=dist
```

**Step 3: Add Environment Variables**
1. Go to Netlify Dashboard > Site Settings > Environment Variables
2. Add same variables as Vercel (see above)
3. Redeploy for changes to take effect

---

#### Option C: Custom Server

```bash
# Build
npm run build

# Serve dist/ folder with any static hosting
# Examples:
# - nginx: serve from /var/www/html
# - Apache: DocumentRoot to dist/
# - PM2: pm2 serve dist/ 3000
```

**Environment Variables for Custom Server:**
- Create `.env.production` with all variables
- Ensure build process reads from it
- Or inject env vars at runtime via server config

---

### 9. Post-Deployment Verification

**After deploying, test these critical flows:**

1. **Homepage Loads**
   - Visit your deployment URL
   - Should show dashboard without errors
   - Check browser console for warnings

2. **Authentication**
   - Click profile icon > Login
   - Should redirect to Supabase auth
   - After login, should return to app

3. **Player Management**
   - Add a test player with photo
   - Verify photo uploads to Supabase storage
   - Check player appears in players list

4. **Match Creation**
   - Create a test match
   - Assign players to teams
   - Save match
   - Verify appears in match history

5. **Database Check**
   ```sql
   -- In Supabase SQL Editor
   SELECT * FROM players LIMIT 5;
   SELECT * FROM matches ORDER BY created_at DESC LIMIT 5;
   SELECT * FROM storage.objects WHERE bucket_id = 'player-photos';
   ```

6. **SEO/OG Preview**
   - Share your URL in Slack/Discord/Twitter
   - Verify preview card shows correct title/description
   - Use [OpenGraph.xyz](https://www.opengraph.xyz/) to test

---

---

### 10. Environment Variables Reference

Complete list of all environment variables with descriptions:

#### Required Variables

| Variable | Example | Description |
|----------|---------|-------------|
| `VITE_SUPABASE_URL` | `https://abc123.supabase.co` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGci...` | Supabase anonymous/public key |
| `VITE_TEAM_NAME` | `NewTeam FC` | Full team name (displays in header) |
| `VITE_TEAM_SHORT_NAME` | `newteam` | Short name for room_id prefix |
| `VITE_APP_DESCRIPTION` | `Plan. Play. Win.` | SEO description & OG tags |
| `VITE_APP_URL` | `https://newteam.vercel.app` | Production URL (for OG tags) |

#### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_TEAM_PRIMARY_COLOR` | `#3b82f6` | Primary brand color (hex) |
| `VITE_FEATURE_ANALYTICS` | `true` | Enable analytics dashboard |
| `VITE_FEATURE_DRAFT` | `true` | Enable draft mode |
| `VITE_FEATURE_UPCOMING` | `true` | Enable upcoming matches widget |

#### How Variables are Used

**Team Branding:**
```javascript
// src/lib/teamConfig.js
export const TEAM_CONFIG = {
  name: import.meta.env.VITE_TEAM_NAME || 'Default FC',
  shortName: import.meta.env.VITE_TEAM_SHORT_NAME || 'default',
  roomId: `${shortName}-lite-room-1`, // e.g., 'newteam-lite-room-1'
  // ...
}
```

**SEO/OG Tags:**
```javascript
// vite.config.js - Injects into index.html at build time
<meta name="description" content="${VITE_APP_DESCRIPTION}" />
<meta property="og:title" content="${VITE_TEAM_NAME}" />
<meta property="og:url" content="${VITE_APP_URL}" />
```

**Feature Toggles:**
```javascript
// Controls which features are visible in the app
if (TEAM_CONFIG.features.draft) {
  // Show draft page
}
```

#### Example .env.local (Development)

```bash
# Copy this entire block to .env.local
VITE_SUPABASE_URL=https://zevkvfsfxxomfxwygcqm.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_TEAM_NAME=NewTeam FC
VITE_TEAM_SHORT_NAME=newteam
VITE_TEAM_PRIMARY_COLOR=#1e40af
VITE_APP_DESCRIPTION=Manage your football team with ease
VITE_APP_URL=http://localhost:5173
VITE_FEATURE_ANALYTICS=true
VITE_FEATURE_DRAFT=true
VITE_FEATURE_UPCOMING=true
```

#### Example Vercel Config (Production)

In Vercel Dashboard > Settings > Environment Variables:

```
VITE_SUPABASE_URL=https://newteam-prod.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
VITE_TEAM_NAME=NewTeam FC
VITE_TEAM_SHORT_NAME=newteam
VITE_TEAM_PRIMARY_COLOR=#1e40af
VITE_APP_DESCRIPTION=Plan. Play. Win. | NewTeam Football Manager
VITE_APP_URL=https://newteam-fm.vercel.app
VITE_FEATURE_ANALYTICS=true
VITE_FEATURE_DRAFT=true
VITE_FEATURE_UPCOMING=true
```

**⚠️ Important:**
- Apply to **all environments** (Production, Preview, Development)
- Update `VITE_APP_URL` after custom domain setup
- Never commit `.env.local` to git (already in `.gitignore`)

---

### 11. Database Schema Validation

Run this verification script to ensure everything is set up correctly:

```sql
-- scripts/schema-verify-basic.sql
SELECT 
  COUNT(*) FILTER (WHERE tablename IN (
    'players', 'matches', 'upcoming_matches', 'settings', 
    'membership_settings', 'payments', 'dues_settings', 
    'match_payments', 'appdb', 'visit_logs'
  )) as tables_created
FROM pg_tables 
WHERE schemaname = 'public';
-- Expected: 10

SELECT COUNT(*) as policies_created
FROM pg_policies 
WHERE schemaname = 'public';
-- Expected: 40+

SELECT COUNT(*) as indexes_created
FROM pg_indexes 
WHERE schemaname = 'public';
-- Expected: 30+
```

---

### 12. Troubleshooting

### Issue: "user_id violates not-null constraint"

**Solution**: Already fixed in `new-team-complete-setup.sql`
- `user_id` is NULLABLE to support room-based mode

### Issue: "Storage bucket not found"

**Solutions**:
1. Run `scripts/storage-player-photos-setup.sql` separately
2. Create bucket manually in Dashboard
3. Check if storage schema is enabled in your project

### Issue: "Timezone offset wrong (6 hours off)"

**Solution**: Already fixed in `new-team-complete-setup.sql`
- All date columns use `TIMESTAMPTZ`
- Uses `localDateTimeToISO()` utility in code

### Issue: "Missing columns: quarterScores, multiField, fees"

**Solution**: Already included in `new-team-complete-setup.sql`
- All extended columns are in the base schema

#### Vercel-Specific Issues

**Issue: Build succeeds but app shows blank screen**

**Symptoms:**
- Vercel deployment successful  
- Opening URL shows blank page
- Browser console shows errors

**Debug Steps:**
1. Open browser DevTools (F12) > Console
2. Look for error: `Cannot read property 'VITE_SUPABASE_URL' of undefined`
3. This means environment variables not set

**Solution:**
1. Go to Vercel Dashboard > Project > Settings > Environment Variables
2. Add ALL required variables (see Section 10: Environment Variables Reference)
3. **IMPORTANT**: Check "Production", "Preview", AND "Development"
4. Redeploy: Deployments tab > ⋯ menu > Redeploy

**Issue: Environment variables not taking effect**

**Symptoms:**
- Added env vars in Vercel
- App still uses default/fallback values

**Solution:**
- Environment variables only apply to **new builds**
- After adding/changing variables: **Must Redeploy**
- Go to Deployments > Latest deployment > ⋯ > Redeploy
- Or push a new commit to trigger rebuild

**Issue: OG image not showing in link previews**

**Symptoms:**
- Sharing URL on Twitter/Slack shows no preview
- Or shows wrong image/description

**Debug:**
1. Check `VITE_APP_URL` matches actual deployed URL
2. Use [OpenGraph.xyz](https://www.opengraph.xyz/) to test
3. Check `public/` folder has logo/og-image

**Solution:**
```bash
# Update VITE_APP_URL in Vercel to match actual domain
VITE_APP_URL=https://your-actual-domain.vercel.app

# Trigger redeploy
git commit --allow-empty -m "Update OG metadata"
git push origin main
```

**Issue: "Failed to fetch" or CORS errors**

**Symptoms:**
- Can't login
- Database queries fail  
- Console shows CORS policy errors

**Solution:**
1. Verify `VITE_SUPABASE_URL` is correct (no trailing slash)
2. Check Supabase project status (not paused)
3. Verify anon key hasn't been regenerated
4. Check Supabase > Authentication > URL Configuration:
   - **Site URL**: Your Vercel URL
   - **Redirect URLs**: Add your Vercel URL(s)

**Issue: Different behavior between local and production**

**Common Causes:**
1. Local `.env.local` has different values than Vercel
2. Feature toggles differ
3. Using different Supabase projects

**Solution:**
```bash
# Export Vercel env vars to compare
vercel env pull .env.production

# Compare with local
diff .env.local .env.production

# Sync values and test locally with production settings
```

---

### 13. Schema Differences from Original Teams

### ✅ Improvements Applied

1. **user_id is NULLABLE** - Supports room-based multi-tenant mode
2. **TIMESTAMPTZ everywhere** - Proper timezone handling
3. **Extended match columns** - quarterScores, multiField, gameMatchups, fees
4. **Phone model tracking** - Better device analytics
5. **Complete RLS policies** - Security for all tables
6. **Optimized indexes** - Better query performance

### Schema Compatibility

This schema is **100% compatible** with:
- ✅ Semihan Football Manager
- ✅ DKSC Football Manager  
- ✅ Hangang Rangers

The unified schema ensures code can be shared across all deployments.

---

### 14. Support & Next Steps

If you encounter issues:

1. Check verification queries above
2. Review `scripts/schema-verify-full.sql` for detailed validation
3. Compare with working deployments (Semihan/DKSC/Hangang)
4. Check Supabase logs for errors

---

### 15. Post-Setup Checklist

1. **Customize branding**: Update colors, logos, team name
2. **Import players**: Use bulk import or add manually
3. **Configure membership**: Customize membership types in settings
4. **Set up accounting**: Configure dues and match fees
5. **Test all features**: Match planner, draft, formation board, stats
6. **Train admins**: Share admin credentials and tutorial

---

### 16. You're All Set! 🎉

Your new Football Manager app is ready to use. All features from the original 3 teams are available:

- ✅ Player Management with Photos
- ✅ Match Planning & Team Assignment
- ✅ Draft Mode (Snake & Round-Robin)
- ✅ Formation Board
- ✅ Stats Tracking
- ✅ Accounting & Payments
- ✅ Analytics Dashboard
- ✅ Multi-field Support
- ✅ Quarter Scoring

Enjoy managing your team! ⚽
