// src/pages/LandingPage.jsx
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { 
  Trophy, Users, Calendar, BarChart3, Shield, Zap, 
  CheckCircle2, ArrowRight, Menu, X, Star, TrendingUp,
  Target, Award, Activity, MessageSquare
} from 'lucide-react'
import logoUrl from '../assets/GoalifyLogo.png'
import LandingDemo from '../components/LandingDemo'

export default function LandingPage({ onGetStarted }) {
  const { t, i18n } = useTranslation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSignup = async (e) => {
    e.preventDefault()
    setLoading(true)
    
    // Simulate signup API call
    setTimeout(() => {
      setLoading(false)
      setSubmitted(true)
      // Call parent handler if provided
      if (onGetStarted) {
        onGetStarted(email)
      }
    }, 1000)
  }

  const features = [
    {
      icon: Users,
      title: t('landing.features.playerManagement.title', { defaultValue: 'Player Management' }),
      description: t('landing.features.playerManagement.desc', { defaultValue: 'Comprehensive player profiles with stats, positions, and performance tracking' })
    },
    {
      icon: Calendar,
      title: t('landing.features.matchScheduling.title', { defaultValue: 'Match Scheduling' }),
      description: t('landing.features.matchScheduling.desc', { defaultValue: 'Plan matches, track attendance, and manage team lineups effortlessly' })
    },
    {
      icon: BarChart3,
      title: t('landing.features.analytics.title', { defaultValue: 'Advanced Analytics' }),
      description: t('landing.features.analytics.desc', { defaultValue: 'Deep insights into team performance, player stats, and game trends' })
    },
    {
      icon: Trophy,
      title: t('landing.features.badges.title', { defaultValue: 'Achievement Badges' }),
      description: t('landing.features.badges.desc', { defaultValue: 'Reward players with beautiful badges for milestones and accomplishments' })
    },
    {
      icon: Shield,
      title: t('landing.features.referee.title', { defaultValue: 'Referee Mode' }),
      description: t('landing.features.referee.desc', { defaultValue: 'Real-time match recording and stats input during games' })
    },
    {
      icon: Zap,
      title: t('landing.features.realtime.title', { defaultValue: 'Real-time Updates' }),
      description: t('landing.features.realtime.desc', { defaultValue: 'Live stats, instant notifications, and synchronized team data' })
    }
  ]

  const testimonials = [
    {
      name: 'David Son',
      role: 'Team Manager',
      content: 'Goalify transformed how we manage our football team. The analytics are incredible!',
      rating: 5
    },
    {
      name: 'Hangang Rangers',
      role: 'Football Club',
      content: 'Best team management app we\'ve used. The badge system keeps players motivated.',
      rating: 5
    },
    {
      name: 'Semihan FC',
      role: 'Amateur League',
      content: 'Easy to use, powerful features. Perfect for our weekly matches.',
      rating: 5
    }
  ]

  const stats = [
    { value: '10K+', label: t('landing.stats.players', { defaultValue: 'Active Players' }) },
    { value: '500+', label: t('landing.stats.teams', { defaultValue: 'Teams' }) },
    { value: '50K+', label: t('landing.stats.matches', { defaultValue: 'Matches Tracked' }) },
    { value: '98%', label: t('landing.stats.satisfaction', { defaultValue: 'Satisfaction' }) }
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-blue-50">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-lg border-b border-stone-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <img src={logoUrl} alt="Goalify" className="h-10 w-10 rounded-lg" />
              <span className="text-2xl font-bold bg-gradient-to-r from-emerald-600 to-blue-600 bg-clip-text text-transparent">
                Goalify
              </span>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-stone-600 hover:text-emerald-600 transition-colors font-medium">
                {t('landing.nav.features', { defaultValue: 'Features' })}
              </a>
              <a href="#pricing" className="text-stone-600 hover:text-emerald-600 transition-colors font-medium">
                {t('landing.nav.pricing', { defaultValue: 'Pricing' })}
              </a>
              <a href="#testimonials" className="text-stone-600 hover:text-emerald-600 transition-colors font-medium">
                {t('landing.nav.testimonials', { defaultValue: 'Testimonials' })}
              </a>
              <button
                onClick={() => onGetStarted && onGetStarted()}
                className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-full font-semibold hover:shadow-lg hover:scale-105 transition-all"
              >
                {t('landing.nav.getStarted', { defaultValue: 'Get Started' })}
              </button>
            </div>

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg hover:bg-stone-100"
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-stone-200 bg-white">
            <div className="px-4 py-4 space-y-3">
              <a href="#features" className="block py-2 text-stone-600 hover:text-emerald-600 transition-colors font-medium">
                {t('landing.nav.features', { defaultValue: 'Features' })}
              </a>
              <a href="#pricing" className="block py-2 text-stone-600 hover:text-emerald-600 transition-colors font-medium">
                {t('landing.nav.pricing', { defaultValue: 'Pricing' })}
              </a>
              <a href="#testimonials" className="block py-2 text-stone-600 hover:text-emerald-600 transition-colors font-medium">
                {t('landing.nav.testimonials', { defaultValue: 'Testimonials' })}
              </a>
              <button
                onClick={() => onGetStarted && onGetStarted()}
                className="w-full px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-full font-semibold hover:shadow-lg transition-all"
              >
                {t('landing.nav.getStarted', { defaultValue: 'Get Started' })}
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-700 rounded-full text-sm font-semibold">
                <Zap className="h-4 w-4" />
                {t('landing.hero.badge', { defaultValue: 'The Future of Team Management' })}
              </div>
              
              <h1 className="text-5xl lg:text-6xl font-bold text-stone-900 leading-tight">
                {t('landing.hero.title', { defaultValue: 'Manage Your Football Team Like a Pro' })}
              </h1>
              
              <p className="text-xl text-stone-600 leading-relaxed">
                {t('landing.hero.subtitle', { defaultValue: 'The all-in-one platform for amateur football teams. Track players, schedule matches, analyze performance, and celebrate achievements.' })}
              </p>

              {/* Signup Form */}
              <div className="space-y-4">
                {!submitted ? (
                  <form onSubmit={handleSignup} className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t('landing.hero.emailPlaceholder', { defaultValue: 'Enter your email' })}
                      required
                      className="flex-1 px-6 py-4 rounded-full border-2 border-stone-200 focus:border-emerald-500 focus:outline-none text-lg"
                    />
                    <button
                      type="submit"
                      disabled={loading}
                      className="px-8 py-4 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-full font-semibold hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {loading ? (
                        <div className="h-6 w-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          {t('landing.hero.cta', { defaultValue: 'Get Started Free' })}
                          <ArrowRight className="h-5 w-5" />
                        </>
                      )}
                    </button>
                  </form>
                ) : (
                  <div className="flex items-center gap-3 p-6 bg-emerald-50 border-2 border-emerald-200 rounded-2xl">
                    <CheckCircle2 className="h-6 w-6 text-emerald-600 flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-emerald-900">
                        {t('landing.hero.successTitle', { defaultValue: 'Thank you for signing up!' })}
                      </p>
                      <p className="text-sm text-emerald-700">
                        {t('landing.hero.successMessage', { defaultValue: 'We\'ll send you an invite soon.' })}
                      </p>
                    </div>
                  </div>
                )}
                <p className="text-sm text-stone-500">
                  {t('landing.hero.noCredit', { defaultValue: 'No credit card required • Free forever for small teams' })}
                </p>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 pt-8">
                {stats.map((stat, idx) => (
                  <div key={idx} className="text-center">
                    <div className="text-3xl font-bold text-emerald-600">{stat.value}</div>
                    <div className="text-sm text-stone-600 mt-1">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Hero Image / Preview */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-tr from-emerald-200 to-blue-200 rounded-3xl blur-3xl opacity-30" />
              <div className="relative bg-white rounded-3xl shadow-2xl p-8 border border-stone-200">
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-4 border-b border-stone-200">
                    <h3 className="text-xl font-bold text-stone-900">Team Dashboard</h3>
                    <div className="flex gap-2">
                      <div className="h-3 w-3 rounded-full bg-red-400" />
                      <div className="h-3 w-3 rounded-full bg-yellow-400" />
                      <div className="h-3 w-3 rounded-full bg-emerald-400" />
                    </div>
                  </div>
                  
                  {/* Preview Cards */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-emerald-50 to-blue-50 rounded-xl">
                      <Trophy className="h-8 w-8 text-emerald-600" />
                      <div className="flex-1">
                        <div className="font-semibold text-stone-900">Next Match</div>
                        <div className="text-sm text-stone-600">Sunday, 3:00 PM</div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 p-4 bg-stone-50 rounded-xl">
                      <Users className="h-8 w-8 text-blue-600" />
                      <div className="flex-1">
                        <div className="font-semibold text-stone-900">Active Players</div>
                        <div className="text-sm text-stone-600">24 members</div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 p-4 bg-stone-50 rounded-xl">
                      <BarChart3 className="h-8 w-8 text-purple-600" />
                      <div className="flex-1">
                        <div className="font-semibold text-stone-900">Win Rate</div>
                        <div className="text-sm text-stone-600">73% this season</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl lg:text-5xl font-bold text-stone-900 mb-4">
              {t('landing.features.title', { defaultValue: 'Everything You Need' })}
            </h2>
            <p className="text-xl text-stone-600 max-w-2xl mx-auto">
              {t('landing.features.subtitle', { defaultValue: 'Powerful features designed for amateur football teams' })}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, idx) => (
              <div
                key={idx}
                className="group p-8 bg-gradient-to-br from-stone-50 to-white rounded-2xl border border-stone-200 hover:border-emerald-300 hover:shadow-xl transition-all"
              >
                <div className="h-14 w-14 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <feature.icon className="h-7 w-7 text-white" />
                </div>
                <h3 className="text-xl font-bold text-stone-900 mb-3">{feature.title}</h3>
                <p className="text-stone-600 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section id="testimonials" className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-emerald-50 to-blue-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl lg:text-5xl font-bold text-stone-900 mb-4">
              {t('landing.testimonials.title', { defaultValue: 'Loved by Teams Worldwide' })}
            </h2>
            <p className="text-xl text-stone-600">
              {t('landing.testimonials.subtitle', { defaultValue: 'See what our users have to say' })}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, idx) => (
              <div key={idx} className="bg-white p-8 rounded-2xl shadow-lg border border-stone-200">
                <div className="flex gap-1 mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="text-stone-700 mb-6 leading-relaxed">"{testimonial.content}"</p>
                <div>
                  <div className="font-bold text-stone-900">{testimonial.name}</div>
                  <div className="text-sm text-stone-500">{testimonial.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl lg:text-5xl font-bold text-stone-900 mb-4">
              {t('landing.pricing.title', { defaultValue: 'Simple, Transparent Pricing' })}
            </h2>
            <p className="text-xl text-stone-600">
              {t('landing.pricing.subtitle', { defaultValue: 'Choose the plan that fits your team' })}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Free Plan */}
            <div className="p-8 bg-stone-50 rounded-2xl border-2 border-stone-200">
              <h3 className="text-2xl font-bold text-stone-900 mb-2">Free</h3>
              <div className="mb-6">
                <span className="text-4xl font-bold text-stone-900">$0</span>
                <span className="text-stone-600">/month</span>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span className="text-stone-700">Up to 15 players</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span className="text-stone-700">Basic stats tracking</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span className="text-stone-700">Match scheduling</span>
                </li>
              </ul>
              <button className="w-full px-6 py-3 bg-stone-200 text-stone-900 rounded-full font-semibold hover:bg-stone-300 transition-colors">
                {t('landing.pricing.getStarted', { defaultValue: 'Get Started' })}
              </button>
            </div>

            {/* Pro Plan */}
            <div className="p-8 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl border-2 border-emerald-400 shadow-xl relative">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-yellow-400 text-stone-900 rounded-full text-sm font-bold">
                POPULAR
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Pro</h3>
              <div className="mb-6">
                <span className="text-4xl font-bold text-white">$29</span>
                <span className="text-emerald-100">/month</span>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-white flex-shrink-0 mt-0.5" />
                  <span className="text-white">Unlimited players</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-white flex-shrink-0 mt-0.5" />
                  <span className="text-white">Advanced analytics</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-white flex-shrink-0 mt-0.5" />
                  <span className="text-white">Achievement badges</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-white flex-shrink-0 mt-0.5" />
                  <span className="text-white">Referee mode</span>
                </li>
              </ul>
              <button className="w-full px-6 py-3 bg-white text-emerald-600 rounded-full font-semibold hover:bg-emerald-50 transition-colors">
                {t('landing.pricing.getStarted', { defaultValue: 'Get Started' })}
              </button>
            </div>

            {/* Enterprise Plan */}
            <div className="p-8 bg-stone-50 rounded-2xl border-2 border-stone-200">
              <h3 className="text-2xl font-bold text-stone-900 mb-2">Enterprise</h3>
              <div className="mb-6">
                <span className="text-4xl font-bold text-stone-900">Custom</span>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span className="text-stone-700">Everything in Pro</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span className="text-stone-700">Multiple teams</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span className="text-stone-700">API access</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span className="text-stone-700">Priority support</span>
                </li>
              </ul>
              <button className="w-full px-6 py-3 bg-stone-200 text-stone-900 rounded-full font-semibold hover:bg-stone-300 transition-colors">
                {t('landing.pricing.contactUs', { defaultValue: 'Contact Us' })}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Demo Section */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-stone-50 via-white to-emerald-50/30 relative overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-block px-6 py-2 bg-gradient-to-r from-emerald-500 to-blue-500 text-white rounded-full text-sm font-bold mb-6 shadow-lg">
              🎮 인터랙티브 데모
            </div>
            <h2 className="text-5xl lg:text-6xl font-black mb-6 bg-gradient-to-r from-stone-900 via-emerald-900 to-blue-900 bg-clip-text text-transparent">
              직접 체험해보세요
            </h2>
            <p className="text-xl text-stone-600 font-medium max-w-3xl mx-auto mb-4">
              실제 앱과 동일한 인터페이스로 Goalify의 모든 기능을 체험할 수 있습니다.
            </p>
            <p className="text-lg text-emerald-600 font-bold">
              ⬇️ 탭을 클릭해서 각 기능을 둘러보세요
            </p>
          </div>

          {/* Demo Component */}
          <div className="flex justify-center">
            <LandingDemo />
          </div>

          {/* Bottom CTA */}
          <div className="text-center mt-16">
            <a 
              href="/" 
              className="inline-flex items-center gap-3 px-10 py-5 bg-gradient-to-r from-emerald-600 to-blue-600 text-white rounded-2xl font-black text-lg shadow-xl hover:shadow-2xl hover:scale-105 transition-all"
            >
              지금 바로 시작하기
              <ArrowRight className="h-6 w-6" />
            </a>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-emerald-600 via-emerald-500 to-blue-600 relative overflow-hidden">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl lg:text-5xl font-bold text-white mb-6">
            {t('landing.cta.title', { defaultValue: 'Ready to Transform Your Team?' })}
          </h2>
          <p className="text-xl text-emerald-50 mb-8">
            {t('landing.cta.subtitle', { defaultValue: 'Join thousands of teams already using Goalify' })}
          </p>
          <button
            onClick={() => onGetStarted && onGetStarted()}
            className="px-10 py-4 bg-white text-emerald-600 rounded-full font-bold text-lg hover:shadow-2xl hover:scale-105 transition-all inline-flex items-center gap-3"
          >
            {t('landing.cta.button', { defaultValue: 'Start Free Trial' })}
            <ArrowRight className="h-6 w-6" />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 bg-stone-900 text-stone-400">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <img src={logoUrl} alt="Goalify" className="h-8 w-8 rounded" />
                <span className="text-xl font-bold text-white">Goalify</span>
              </div>
              <p className="text-sm">
                {t('landing.footer.tagline', { defaultValue: 'The future of amateur football team management' })}
              </p>
            </div>
            
            <div>
              <h4 className="text-white font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#features" className="hover:text-emerald-400 transition-colors">Features</a></li>
                <li><a href="#pricing" className="hover:text-emerald-400 transition-colors">Pricing</a></li>
                <li><a href="#" className="hover:text-emerald-400 transition-colors">Roadmap</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="text-white font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-emerald-400 transition-colors">About</a></li>
                <li><a href="#" className="hover:text-emerald-400 transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-emerald-400 transition-colors">Careers</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="text-white font-semibold mb-4">Support</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-emerald-400 transition-colors">Help Center</a></li>
                <li><a href="#" className="hover:text-emerald-400 transition-colors">Contact</a></li>
                <li><a href="#" className="hover:text-emerald-400 transition-colors">Privacy</a></li>
              </ul>
            </div>
          </div>
          
          <div className="pt-8 border-t border-stone-800 text-center text-sm">
            <p>© 2025 Goalify. {t('landing.footer.rights', { defaultValue: 'All rights reserved.' })}</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
