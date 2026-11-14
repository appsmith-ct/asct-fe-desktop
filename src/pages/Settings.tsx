import { CheckCircle2Icon, Loader2Icon, PlusIcon, RotateCcwIcon, XCircleIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

import { api } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

type ModelProfile = {
  id: string
  base_url: string
  model: string
  ctx: number
  tools: 'native' | 'json_action'
  temperature: number
}
type RoleConfig = { profile: string; thinking: boolean }
type Limits = {
  max_concurrent_llm_calls: number
  dev_attempts: number
  review_rounds: number
  bugfix_rounds: number
  container_execution: boolean
}

const ROLES = ['intake', 'ba', 'sa', 'tech_lead', 'dev_senior', 'dev_mid', 'dev_intern', 'qa']
const GATE_OPTIONS = ['after_ba', 'after_sa', 'after_milestone']

const BLANK_PROFILE: ModelProfile = {
  id: '',
  base_url: 'http://127.0.0.1:8080/v1',
  model: '',
  ctx: 8192,
  tools: 'json_action',
  temperature: 0.2,
}

export default function SettingsPage() {
  const [profiles, setProfiles] = useState<ModelProfile[]>([])
  const [roles, setRoles] = useState<Record<string, RoleConfig>>({})
  const [limits, setLimits] = useState<Limits | null>(null)
  const [gates, setGates] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [newProfile, setNewProfile] = useState<ModelProfile>(BLANK_PROFILE)

  async function reload() {
    const { data } = await api.GET('/settings/models')
    if (data) {
      setProfiles(data.profiles)
      setRoles(data.roles)
      setLimits(data.limits)
      setGates(data.gates)
    }
    setLoading(false)
  }

  useEffect(() => {
    void reload()
  }, [])

  async function saveProfile(profile: ModelProfile) {
    await api.PUT('/settings/models', { body: { profiles: [profile] } })
    await reload()
  }

  async function saveRole(role: string, config: RoleConfig) {
    await api.PUT('/settings/models', { body: { roles: { [role]: config } } })
    await reload()
  }

  async function saveLimits(next: Limits) {
    setLimits(next)
    await api.PUT('/settings/models', { body: { limits: next } })
  }

  async function toggleGate(gate: string) {
    const next = gates.includes(gate) ? gates.filter((g) => g !== gate) : [...gates, gate]
    setGates(next)
    await api.PUT('/settings/models', { body: { gates: next } })
  }

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading settings…</div>
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Model profiles, role mapping, prompts, limits and gates — all live in the engine's
          settings database and apply from the next run.
        </p>
      </div>

      <Tabs defaultValue="profiles">
        <TabsList>
          <TabsTrigger value="profiles">Profiles</TabsTrigger>
          <TabsTrigger value="roles">Role mapping</TabsTrigger>
          <TabsTrigger value="prompts">Prompts</TabsTrigger>
          <TabsTrigger value="limits">Limits & gates</TabsTrigger>
        </TabsList>

        <TabsContent value="profiles" className="space-y-4">
          {profiles.map((profile) => (
            <ProfileCard key={profile.id} profile={profile} onSave={saveProfile} />
          ))}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Add a profile</CardTitle>
            </CardHeader>
            <CardContent>
              <ProfileForm
                profile={newProfile}
                onChange={setNewProfile}
                onSubmit={async () => {
                  if (!newProfile.id) return
                  await saveProfile(newProfile)
                  setNewProfile(BLANK_PROFILE)
                }}
                submitLabel="Add profile"
                submitIcon={PlusIcon}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roles" className="space-y-3">
          {ROLES.map((role) => (
            <RoleRow
              key={role}
              role={role}
              config={roles[role]}
              profiles={profiles}
              onSave={(config) => saveRole(role, config)}
            />
          ))}
        </TabsContent>

        <TabsContent value="prompts">
          <PromptsPanel roles={ROLES} />
        </TabsContent>

        <TabsContent value="limits" className="space-y-6">
          {limits && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Limits</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <NumberField
                  label="Dev attempts"
                  value={limits.dev_attempts}
                  onChange={(v) => saveLimits({ ...limits, dev_attempts: v })}
                />
                <NumberField
                  label="Review rounds"
                  value={limits.review_rounds}
                  onChange={(v) => saveLimits({ ...limits, review_rounds: v })}
                />
                <NumberField
                  label="Bugfix rounds"
                  value={limits.bugfix_rounds}
                  onChange={(v) => saveLimits({ ...limits, bugfix_rounds: v })}
                />
                <NumberField
                  label="Max concurrent LLM calls"
                  value={limits.max_concurrent_llm_calls}
                  onChange={(v) => saveLimits({ ...limits, max_concurrent_llm_calls: v })}
                />
                <div className="col-span-2 flex items-center justify-between rounded-md border p-3">
                  <div>
                    <div className="text-sm font-medium">Container execution</div>
                    <div className="text-xs text-muted-foreground">
                      Run allowlisted commands inside Docker when available. Off by default — see
                      the engine's own notes on why.
                    </div>
                  </div>
                  <Switch
                    checked={limits.container_execution}
                    onCheckedChange={(checked) =>
                      saveLimits({ ...limits, container_execution: checked })
                    }
                  />
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Human gates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {GATE_OPTIONS.map((gate) => (
                <div key={gate} className="flex items-center justify-between rounded-md border p-3">
                  <span className="text-sm">{gate}</span>
                  <Switch checked={gates.includes(gate)} onCheckedChange={() => toggleGate(gate)} />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}

function ProfileCard({
  profile,
  onSave,
}: {
  profile: ModelProfile
  onSave: (profile: ModelProfile) => Promise<void>
}) {
  const [draft, setDraft] = useState(profile)
  const [testResult, setTestResult] = useState<'idle' | 'testing' | 'ok' | 'failed'>('idle')

  async function testConnection() {
    setTestResult('testing')
    const { data } = await api.POST('/settings/profiles/{profile_id}/test-connection', {
      params: { path: { profile_id: profile.id } },
    })
    setTestResult(data?.ok ? 'ok' : 'failed')
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-sm">{profile.id}</CardTitle>
        <div className="flex items-center gap-2">
          {testResult === 'ok' && <CheckCircle2Icon className="size-4 text-success" />}
          {testResult === 'failed' && <XCircleIcon className="size-4 text-destructive" />}
          <Button
            variant="outline"
            size="sm"
            onClick={testConnection}
            disabled={testResult === 'testing'}
          >
            {testResult === 'testing' ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              'Test connection'
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ProfileForm
          profile={draft}
          onChange={setDraft}
          disableId
          onSubmit={() => onSave(draft)}
          submitLabel="Save"
        />
      </CardContent>
    </Card>
  )
}

function ProfileForm({
  profile,
  onChange,
  onSubmit,
  submitLabel,
  submitIcon: SubmitIcon,
  disableId,
}: {
  profile: ModelProfile
  onChange: (profile: ModelProfile) => void
  onSubmit: () => void
  submitLabel: string
  submitIcon?: React.ComponentType<{ className?: string }>
  disableId?: boolean
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1">
        <Label>Profile id</Label>
        <Input
          value={profile.id}
          disabled={disableId}
          onChange={(e) => onChange({ ...profile, id: e.target.value })}
          placeholder="my-local-model"
        />
      </div>
      <div className="space-y-1">
        <Label>Model name</Label>
        <Input value={profile.model} onChange={(e) => onChange({ ...profile, model: e.target.value })} />
      </div>
      <div className="col-span-2 space-y-1">
        <Label>Base URL</Label>
        <Input
          value={profile.base_url}
          onChange={(e) => onChange({ ...profile, base_url: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label>Context size</Label>
        <Input
          type="number"
          value={profile.ctx}
          onChange={(e) => onChange({ ...profile, ctx: Number(e.target.value) })}
        />
      </div>
      <div className="space-y-1">
        <Label>Temperature</Label>
        <Input
          type="number"
          step="0.1"
          value={profile.temperature}
          onChange={(e) => onChange({ ...profile, temperature: Number(e.target.value) })}
        />
      </div>
      <div className="col-span-2 space-y-1">
        <Label>Tool strategy</Label>
        <Select
          value={profile.tools}
          onValueChange={(v) => onChange({ ...profile, tools: v as ModelProfile['tools'] })}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="json_action">json_action</SelectItem>
            <SelectItem value="native">native</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="col-span-2">
        <Button size="sm" onClick={onSubmit}>
          {SubmitIcon && <SubmitIcon className="size-4" />}
          {submitLabel}
        </Button>
      </div>
    </div>
  )
}

function RoleRow({
  role,
  config,
  profiles,
  onSave,
}: {
  role: string
  config: RoleConfig | undefined
  profiles: ModelProfile[]
  onSave: (config: RoleConfig) => void
}) {
  const current = config ?? { profile: profiles[0]?.id ?? '', thinking: false }

  return (
    <div className="flex items-center justify-between gap-4 rounded-md border p-3">
      <span className="w-32 shrink-0 font-mono text-sm">{role}</span>
      <Select
        value={current.profile}
        onValueChange={(profile) => onSave({ ...current, profile })}
      >
        <SelectTrigger className="flex-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {profiles.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground">Thinking</Label>
        <Switch
          checked={current.thinking}
          onCheckedChange={(thinking) => onSave({ ...current, thinking })}
        />
      </div>
    </div>
  )
}

function PromptsPanel({ roles }: { roles: string[] }) {
  const [role, setRole] = useState(roles[0])
  const [template, setTemplate] = useState('')
  const [version, setVersion] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  async function load(nextRole: string) {
    setLoading(true)
    const { data } = await api.GET('/settings/prompts/{role}', { params: { path: { role: nextRole } } })
    setTemplate(data?.template ?? '')
    setVersion(data?.version ?? null)
    setLoading(false)
  }

  useEffect(() => {
    void load(role)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="space-y-3">
      <Select
        value={role}
        onValueChange={(next) => {
          setRole(next)
          void load(next)
        }}
      >
        <SelectTrigger className="w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {roles.map((r) => (
            <SelectItem key={r} value={r}>
              {r}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {!loading && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">version {version}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const { data } = await api.POST('/settings/prompts/{role}/reset', {
                  params: { path: { role } },
                })
                if (data) {
                  setTemplate(data.template)
                  setVersion(data.version)
                }
              }}
            >
              <RotateCcwIcon className="size-4" /> Reset to default
            </Button>
          </div>
          <Textarea
            className="min-h-80 font-mono text-xs"
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
          />
          <Button
            size="sm"
            onClick={async () => {
              const { data } = await api.PUT('/settings/prompts/{role}', {
                params: { path: { role } },
                body: { template },
              })
              if (data) setVersion(data.version)
            }}
          >
            Save
          </Button>
        </>
      )}
    </div>
  )
}
