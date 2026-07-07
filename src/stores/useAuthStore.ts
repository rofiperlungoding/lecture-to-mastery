import { create } from 'zustand'
import type { Session, User, Subscription } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface AuthState {
  session: Session | null
  user: User | null
  initialized: boolean
  loading: boolean
  error: string | null
  initialize: () => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signInWithPassword: (email: string, password: string) => Promise<void>
  signInAnonymously: () => Promise<void>
  signOut: () => Promise<void>
  clearError: () => void
}

let authSubscription: Subscription | null = null

export const useAuthStore = create<AuthState>()((set) => ({
  session: null,
  user: null,
  initialized: false,
  loading: false,
  error: null,

  clearError: () => set({ error: null }),

  initialize: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    set({ session, user: session?.user ?? null, initialized: true })

    if (authSubscription) {
      authSubscription.unsubscribe()
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, user: session?.user ?? null })
    })
    authSubscription = subscription
  },

  signUp: async (email: string, password: string) => {
    set({ loading: true, error: null })
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })
    if (error) {
      console.error('[Auth] signUp failed:', { status: error.status, message: error.message, name: error.name })
      set({ loading: false, error: error.message })
      throw error
    }
    if (data.session) {
      set({ session: data.session, user: data.session.user })
    }
    set({ loading: false })
  },

  signInWithPassword: async (email: string, password: string) => {
    set({ loading: true, error: null })
    const { data: { session }, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) {
      console.error('[Auth] signInWithPassword failed:', { status: error.status, message: error.message, name: error.name })
      set({ loading: false, error: error.message })
      throw error
    }
    set({ session, user: session?.user ?? null, loading: false })
  },

  signInAnonymously: async () => {
    set({ loading: true, error: null })
    const { data: { session }, error } = await supabase.auth.signInAnonymously()
    if (error) {
      console.error('[Auth] signInAnonymously failed:', { status: error.status, message: error.message, name: error.name })
      set({ loading: false, error: error.message })
      throw error
    }
    set({ session, user: session?.user ?? null, loading: false })
  },

  signOut: async () => {
    set({ loading: true, error: null })
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('[Auth] signOut failed:', { status: error.status, message: error.message, name: error.name })
      set({ loading: false, error: error.message })
      throw error
    }
    set({ session: null, user: null, loading: false })
  },
}))
