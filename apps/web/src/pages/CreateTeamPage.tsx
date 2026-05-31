// E3-S1: Create team form
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { CreateTeamRequestSchema, AGE_DIVISIONS } from '@diamondhub/contracts'
import type { CreateTeamRequest } from '@diamondhub/contracts'
import { teamApi } from '../api/team.api.js'
import { Button } from '../components/ui/Button.js'
import { Input } from '../components/ui/Input.js'

const CURRENT_YEAR = new Date().getFullYear()
const SEASON_YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - 1 + i)

export function CreateTeamPage() {
  const navigate = useNavigate()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<CreateTeamRequest>({
    resolver: zodResolver(CreateTeamRequestSchema),
    defaultValues: {
      sport: 'BASEBALL',
      seasonYear: CURRENT_YEAR,
    },
  })

  const createMutation = useMutation({
    mutationFn: teamApi.createTeam,
    onSuccess: (team) => {
      navigate(`/teams/${team.id}`, { replace: true })
    },
    onError: () => {
      setError('root', { message: 'Failed to create team. Please try again.' })
    },
  })

  const onSubmit = (data: CreateTeamRequest) => {
    createMutation.mutate(data)
  }

  return (
    <div className="flex flex-col min-h-full bg-gray-950">
      {/* Header */}
      <div className="sticky top-14 z-30 bg-gray-950 border-b border-gray-800 px-4 pt-4 pb-3 flex items-center gap-3">
        <button
          onClick={() => navigate('/teams')}
          className="h-10 w-10 flex items-center justify-center text-gray-400 hover:text-white rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label="Back to teams"
        >
          ‹
        </button>
        <h1 className="text-lg font-bold text-white">Create Team</h1>
      </div>

      {/* Form */}
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex-1 px-4 py-6 space-y-5 max-w-lg mx-auto w-full"
        noValidate
      >
        {/* Team name */}
        <Input
          label="Team Name"
          placeholder="e.g. Westside Warriors"
          error={errors.name?.message}
          {...register('name')}
        />

        {/* Sport */}
        <div>
          <span className="block text-sm font-medium text-gray-300 mb-2">Sport</span>
          <div className="grid grid-cols-2 gap-3">
            {(['BASEBALL', 'SOFTBALL'] as const).map((sport) => (
              <label
                key={sport}
                className="relative cursor-pointer"
              >
                <input
                  type="radio"
                  value={sport}
                  className="sr-only peer"
                  {...register('sport')}
                />
                <div className="h-12 flex items-center justify-center gap-2 rounded-xl border border-gray-700 text-gray-300 text-sm font-semibold transition-colors peer-checked:bg-blue-600 peer-checked:border-blue-500 peer-checked:text-white hover:border-gray-600 cursor-pointer">
                  <span aria-hidden="true">{sport === 'BASEBALL' ? '⚾' : '🥎'}</span>
                  <span>{sport === 'BASEBALL' ? 'Baseball' : 'Softball'}</span>
                </div>
              </label>
            ))}
          </div>
          {errors.sport && (
            <p className="mt-1 text-sm text-red-400" role="alert">
              {errors.sport.message}
            </p>
          )}
        </div>

        {/* Age division */}
        <div>
          <label
            htmlFor="ageDivision"
            className="block text-sm font-medium text-gray-300 mb-1.5"
          >
            Age Division
          </label>
          <select
            id="ageDivision"
            className="w-full h-12 px-4 rounded-xl bg-gray-800 border border-gray-700 text-white text-base focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none appearance-none"
            {...register('ageDivision')}
          >
            <option value="">Select division…</option>
            {AGE_DIVISIONS.map((div) => (
              <option key={div} value={div}>
                {div}
              </option>
            ))}
          </select>
          {errors.ageDivision && (
            <p className="mt-1 text-sm text-red-400" role="alert">
              {errors.ageDivision.message}
            </p>
          )}
        </div>

        {/* Season year */}
        <div>
          <label
            htmlFor="seasonYear"
            className="block text-sm font-medium text-gray-300 mb-1.5"
          >
            Season Year
          </label>
          <select
            id="seasonYear"
            className="w-full h-12 px-4 rounded-xl bg-gray-800 border border-gray-700 text-white text-base focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none appearance-none"
            {...register('seasonYear', { valueAsNumber: true })}
          >
            {SEASON_YEARS.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
          {errors.seasonYear && (
            <p className="mt-1 text-sm text-red-400" role="alert">
              {errors.seasonYear.message}
            </p>
          )}
        </div>

        {/* Optional: home field */}
        <div className="border-t border-gray-800 pt-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-4">
            Home Field (optional)
          </p>
          <div className="space-y-4">
            <Input
              label="Field Name"
              placeholder="e.g. Riverside Park Field 2"
              error={errors.homeFieldName?.message}
              {...register('homeFieldName')}
            />
            <Input
              label="City"
              placeholder="e.g. Nashville, TN"
              error={errors.homeFieldCity?.message}
              {...register('homeFieldCity')}
            />
          </div>
        </div>

        {/* Root error */}
        {errors.root && (
          <div className="rounded-xl bg-red-900/20 border border-red-800 p-3">
            <p className="text-red-400 text-sm" role="alert">
              {errors.root.message}
            </p>
          </div>
        )}

        {/* Submit */}
        <div className="pt-2 pb-8">
          <Button
            type="submit"
            size="lg"
            className="w-full"
            isLoading={isSubmitting || createMutation.isPending}
            disabled={isSubmitting || createMutation.isPending}
          >
            Create Team
          </Button>
        </div>
      </form>
    </div>
  )
}
