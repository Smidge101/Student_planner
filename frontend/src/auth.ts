import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ApiError, api } from './api'
import type { Me } from './types'

const ME_KEY = ['me']

/** The logged-in user, or null when logged out. */
export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        return await api<Me>('/auth/me/')
      } catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return null
        throw error
      }
    },
    staleTime: 60_000,
  })
}

export interface SignupData {
  full_name: string
  email: string
  username: string
  password: string
  password_confirm: string
  email_reminders: boolean
}

export function useSignup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: SignupData) => api<Me>('/auth/signup/', 'POST', data),
    onSuccess: (me) => queryClient.setQueryData(ME_KEY, me),
  })
}

export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { username: string; password: string }) =>
      api<Me>('/auth/login/', 'POST', data),
    onSuccess: (me) => {
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' })
      queryClient.setQueryData(ME_KEY, me)
    },
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api<void>('/auth/logout/', 'POST'),
    onSuccess: () => {
      // Drop every cached response so the next user never sees this one's data.
      queryClient.clear()
      queryClient.setQueryData(ME_KEY, null)
    },
  })
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Pick<Me['profile'], 'theme_mode' | 'accent_color'>> & { display_name?: string }) =>
      api<Me>('/auth/me/', 'PATCH', data),
    onSuccess: (me) => queryClient.setQueryData(ME_KEY, me),
  })
}
