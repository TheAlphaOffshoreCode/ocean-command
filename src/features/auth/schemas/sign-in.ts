import { z } from 'zod'

/**
 * One definition, used by the form and by the server action. Client validation
 * is UX; the server parse is the control.
 */
export const signInSchema = z.object({
  email: z.string().min(1, 'Enter your e-mail').email('Enter a valid e-mail address'),
  password: z.string().min(1, 'Enter your password'),
})

export type SignInInput = z.infer<typeof signInSchema>
