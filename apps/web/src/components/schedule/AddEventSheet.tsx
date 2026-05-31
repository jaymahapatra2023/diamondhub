// E4: AddEventSheet — bottom sheet form for creating/editing events
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ScheduleEventResponse } from '@diamondhub/contracts'
import { CreateEventRequestSchema } from '@diamondhub/contracts'
import { scheduleApi } from '../../api/schedule.api.js'
import { Button } from '../ui/Button.js'
import { Input } from '../ui/Input.js'

// ── Form schema (subset of CreateEventRequest — uses date+time strings for inputs) ──

const FormSchema = z
  .object({
    title: z.string().min(1, 'Title is required').max(200).trim(),
    type: z.enum(['PRACTICE', 'GAME', 'MEETING', 'OTHER', 'TOURNAMENT']),
    date: z.string().min(1, 'Date is required'),
    startTimeStr: z.string().min(1, 'Start time is required'),
    endTimeStr: z.string().min(1, 'End time is required'),
    locationName: z.string().max(200).optional().or(z.literal('')),
    locationAddress: z.string().max(300).optional().or(z.literal('')),
    notes: z.string().max(2000).optional().or(z.literal('')),
    sendNotification: z.boolean(),
  })
  .refine(
    (d) => {
      if (!d.date || !d.startTimeStr || !d.endTimeStr) return true
      const start = new Date(`${d.date}T${d.startTimeStr}`)
      const end = new Date(`${d.date}T${d.endTimeStr}`)
      return end > start
    },
    { message: 'End time must be after start time', path: ['endTimeStr'] },
  )

type FormValues = z.infer<typeof FormSchema>

// Convert form fields to ISO datetime strings in local time
function toISOLocal(date: string, time: string): string {
  return new Date(`${date}T${time}`).toISOString()
}

// Convert ISO datetime to date/time input strings
function isoToDate(iso: string): string {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function isoToTime(iso: string): string {
  const d = new Date(iso)
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${min}`
}

// ── Label maps ────────────────────────────────────────────────────────────────

const TYPE_OPTIONS: { value: FormValues['type']; label: string }[] = [
  { value: 'PRACTICE', label: 'Practice' },
  { value: 'GAME', label: 'Game' },
  { value: 'TOURNAMENT', label: 'Tournament' },
  { value: 'MEETING', label: 'Meeting' },
  { value: 'OTHER', label: 'Other' },
]

// ── AddEventSheet ─────────────────────────────────────────────────────────────

export interface AddEventSheetProps {
  isOpen: boolean
  teamId: string
  /** If provided, sheet is in edit mode */
  existingEvent?: ScheduleEventResponse | null
  onClose: () => void
  onSaved?: (event: ScheduleEventResponse) => void
}

export function AddEventSheet({
  isOpen,
  teamId,
  existingEvent,
  onClose,
  onSaved,
}: AddEventSheetProps) {
  const queryClient = useQueryClient()
  const isEdit = !!existingEvent

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      title: '',
      type: 'PRACTICE',
      date: '',
      startTimeStr: '',
      endTimeStr: '',
      locationName: '',
      locationAddress: '',
      notes: '',
      sendNotification: true,
    },
  })

  // Pre-fill form when editing
  useEffect(() => {
    if (!isOpen) return
    if (existingEvent) {
      reset({
        title: existingEvent.title,
        type: existingEvent.type,
        date: isoToDate(existingEvent.startTime),
        startTimeStr: isoToTime(existingEvent.startTime),
        endTimeStr: isoToTime(existingEvent.endTime),
        locationName: existingEvent.locationName ?? '',
        locationAddress: existingEvent.locationAddress ?? '',
        notes: existingEvent.notes ?? '',
        sendNotification: false,
      })
    } else {
      reset({
        title: '',
        type: 'PRACTICE',
        date: '',
        startTimeStr: '',
        endTimeStr: '',
        locationName: '',
        locationAddress: '',
        notes: '',
        sendNotification: true,
      })
    }
  }, [isOpen, existingEvent, reset])

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = CreateEventRequestSchema.parse({
        title: values.title,
        type: values.type,
        startTime: toISOLocal(values.date, values.startTimeStr),
        endTime: toISOLocal(values.date, values.endTimeStr),
        locationName: values.locationName || undefined,
        locationAddress: values.locationAddress || undefined,
        notes: values.notes || undefined,
        sendNotification: values.sendNotification,
      })
      if (isEdit && existingEvent) {
        return scheduleApi.updateEvent(teamId, existingEvent.id, payload)
      }
      return scheduleApi.createEvent(teamId, payload)
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['schedule'] })
      onSaved?.(saved)
      onClose()
    },
  })

  if (!isOpen) return null

  const onSubmit = (values: FormValues) => {
    mutation.mutate(values)
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? 'Edit event' : 'Add event'}
        className="fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto bg-gray-900 border-t border-gray-700 rounded-t-2xl shadow-2xl pb-safe"
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-700" aria-hidden="true" />
        </div>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="px-4 pt-2 pb-8 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">
                {isEdit ? 'Edit Event' : 'New Event'}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="w-9 h-9 rounded-full bg-gray-800 text-gray-400 flex items-center justify-center hover:bg-gray-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5" aria-hidden="true">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>

            {/* Global mutation error */}
            {mutation.isError && (
              <div className="p-3 rounded-xl bg-red-900/30 border border-red-800/50 text-red-400 text-sm" role="alert">
                {mutation.error instanceof Error
                  ? mutation.error.message
                  : 'Something went wrong. Please try again.'}
              </div>
            )}

            {/* Title */}
            <Input
              label="Title"
              placeholder="e.g. Saturday Practice"
              {...(errors.title?.message ? { error: errors.title.message } : {})}
              {...register('title')}
            />

            {/* Event type */}
            <div className="w-full">
              <label
                htmlFor="event-type"
                className="block text-sm font-medium text-gray-300 mb-1.5"
              >
                Event type
              </label>
              <select
                id="event-type"
                className="w-full h-12 px-4 rounded-xl bg-gray-800 text-white border border-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors text-base appearance-none"
                {...register('type')}
              >
                {TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {errors.type && (
                <p className="mt-1 text-sm text-red-400" role="alert">
                  {errors.type.message}
                </p>
              )}
            </div>

            {/* Date */}
            <Input
              label="Date"
              type="date"
              {...(errors.date?.message ? { error: errors.date.message } : {})}
              {...register('date')}
            />

            {/* Start & End time */}
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Start time"
                type="time"
                {...(errors.startTimeStr?.message ? { error: errors.startTimeStr.message } : {})}
                {...register('startTimeStr')}
              />
              <Input
                label="End time"
                type="time"
                {...(errors.endTimeStr?.message ? { error: errors.endTimeStr.message } : {})}
                {...register('endTimeStr')}
              />
            </div>

            {/* Location name */}
            <Input
              label="Location name (optional)"
              placeholder="e.g. Riverside Baseball Complex"
              {...(errors.locationName?.message ? { error: errors.locationName.message } : {})}
              {...register('locationName')}
            />

            {/* Location address */}
            <Input
              label="Address (optional)"
              placeholder="e.g. 123 Main St, Nashville, TN"
              {...(errors.locationAddress?.message ? { error: errors.locationAddress.message } : {})}
              {...register('locationAddress')}
            />

            {/* Notes */}
            <div className="w-full">
              <label
                htmlFor="event-notes"
                className="block text-sm font-medium text-gray-300 mb-1.5"
              >
                Notes (optional)
              </label>
              <textarea
                id="event-notes"
                rows={3}
                placeholder="Any additional details for the team..."
                className="w-full px-4 py-3 rounded-xl bg-gray-800 text-white placeholder-gray-500 border border-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors text-base resize-none"
                {...register('notes')}
              />
              {errors.notes && (
                <p className="mt-1 text-sm text-red-400" role="alert">
                  {errors.notes.message}
                </p>
              )}
            </div>

            {/* Send notification toggle */}
            <label className="flex items-center gap-3 cursor-pointer">
              <div className="relative">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  {...register('sendNotification')}
                />
                <div className="w-10 h-6 bg-gray-700 peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:bg-blue-600 transition-colors" />
                <div className="absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform peer-checked:translate-x-4" />
              </div>
              <span className="text-sm text-gray-300">Notify team members</span>
            </label>

            {/* Submit */}
            <Button
              type="submit"
              size="lg"
              className="w-full"
              isLoading={mutation.isPending}
            >
              {isEdit ? 'Save changes' : 'Create Event'}
            </Button>
          </div>
        </form>
      </div>
    </>
  )
}
