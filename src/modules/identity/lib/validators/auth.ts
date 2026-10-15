import { z } from 'zod'

export const signupSchema = z.object({
  full_name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(80, 'Name cannot exceed 80 characters'),
  email: z.string().email('Please enter a valid email'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password cannot exceed 72 characters'),
  phone: z
    .string()
    .min(11, 'Please enter a valid phone number (11 digits)')
    .max(15, 'Phone number cannot exceed 15 digits')
    .optional()
    .or(z.literal('')),
})

export const loginSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(1, 'Password is required'),
  location: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracy_meters: z.number().min(0).max(100000),
  }).optional(),
})

export type SignupInput = z.infer<typeof signupSchema>
export type LoginInput = z.infer<typeof loginSchema>
