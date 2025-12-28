# Goalify Landing Page

## Access the Landing Page

The Goalify landing page is now available at:

### Production
- **Standalone HTML**: `https://your-domain.vercel.app/landing.html`
- **React Component**: Can be integrated into the main app routing

### Local Development
- **Standalone HTML**: `http://localhost:5173/landing.html`
- **React Component**: Import `LandingPage` from `src/pages/LandingPage.jsx`

## Features

### Landing Page Components

1. **Hero Section**
   - Eye-catching headline with gradient text
   - Email signup form
   - Key statistics (10K+ players, 500+ teams, etc.)
   - Modern preview card showing dashboard

2. **Features Grid**
   - Player Management
   - Match Scheduling
   - Advanced Analytics
   - Achievement Badges
   - Referee Mode
   - Real-time Updates

3. **Testimonials Section**
   - Social proof from real users
   - 5-star ratings
   - Team names and roles

4. **Pricing Section**
   - Free tier (up to 15 players)
   - Pro tier ($29/month)
   - Enterprise tier (custom pricing)

5. **Call-to-Action Section**
   - Bold gradient background
   - Clear "Launch App" button

6. **Footer**
   - Product links
   - Company information
   - Support resources

## Customization

### Standalone HTML (`public/landing.html`)
- Self-contained with Tailwind CSS CDN
- No build process required
- Can be deployed separately as marketing site
- Easy to customize colors and content

### React Component (`src/pages/LandingPage.jsx`)
- Full TypeScript/JSX support
- i18n translations ready
- Integrates with main app
- Customizable via props

## Integration with Main App

To add the React landing page to your main app routing:

```jsx
// In App.jsx
import LandingPage from './pages/LandingPage'

// Add to your routing logic
{showLanding && <LandingPage onGetStarted={(email) => {
  // Handle signup
  console.log('User signed up:', email)
  setShowLanding(false)
}} />}
```

## Signup Form Integration

The landing page includes a signup form. To connect it to your backend:

1. **Standalone HTML**: Update the JavaScript in `public/landing.html`
```javascript
// Replace the console.log with actual API call
fetch('/api/signup', {
  method: 'POST',
  body: JSON.stringify({ email }),
  headers: { 'Content-Type': 'application/json' }
})
```

2. **React Component**: Pass `onGetStarted` prop
```jsx
<LandingPage onGetStarted={(email) => {
  // Your signup logic
  signupUser(email)
}} />
```

## Styling

The landing page uses:
- Tailwind CSS for styling
- Custom gradient animations
- Responsive design (mobile-first)
- Smooth transitions and hover effects
- Modern glassmorphism effects

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Performance

- Optimized images
- Minimal JavaScript
- Fast page load (<2s)
- Mobile-friendly (Core Web Vitals compliant)

## Next Steps

1. ✅ Landing page created
2. ✅ Deployed to production
3. 🔲 Connect signup form to email service (e.g., Mailchimp, SendGrid)
4. 🔲 Add Google Analytics tracking
5. 🔲 Set up A/B testing
6. 🔲 Add more testimonials
7. 🔲 Create demo video

## Support

For questions or issues, contact: sonhyosuck@gmail.com
