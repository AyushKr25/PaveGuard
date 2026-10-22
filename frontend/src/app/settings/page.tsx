'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  createBrowserSupabaseClient,
  getCurrentUser,
  getUserProfile,
  updateUserProfile,
  getUserPreferences,
  updateUserPreferences,
  updatePassword,
} from '@/lib/supabase';
import { Loader2 } from 'lucide-react';

export default function SettingsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [fullName, setFullName] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [prefs, setPrefs] = React.useState<{ theme: 'light' | 'dark' | 'system'; inference_mode: 'auto' | 'browser' | 'cloud'; inference_fps: number; confidence_threshold: number; enable_gps: boolean; auto_save_detections: boolean; }>({
    theme: 'system',
    inference_mode: 'auto',
    inference_fps: 5,
    confidence_threshold: 0.25,
    enable_gps: true,
    auto_save_detections: false,
  });
  const [isSaving, setIsSaving] = React.useState(false);
  const [userId, setUserId] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      try {
        const user = await getCurrentUser();
        if (!user) return;
        setUserId(user.id);
        const [{ data: profile }, { data: preferences }] = await Promise.all([
          getUserProfile(user.id),
          getUserPreferences(user.id),
        ]);
        if (profile) setFullName(profile.full_name || '');
        if (preferences) {
          setPrefs({
            theme: preferences.theme || 'system',
            inference_mode: preferences.inference_mode || 'auto',
            inference_fps: preferences.inference_fps ?? 5,
            confidence_threshold: Number(preferences.confidence_threshold ?? 0.25),
            enable_gps: preferences.enable_gps ?? true,
            auto_save_detections: preferences.auto_save_detections ?? false,
          });
        }
      } catch (error) {
        toast({
          title: 'Failed to load settings',
          description: error instanceof Error ? error.message : 'Unknown error',
          variant: 'destructive',
        });
      }
    })();
  }, [toast]);

  const saveProfile = async () => {
    if (!userId) return;
    setIsSaving(true);
    try {
      const { error } = await updateUserProfile(userId, { full_name: fullName });
      if (error) throw error;
      toast({ title: 'Profile updated' });
    } catch (error) {
      toast({ title: 'Update failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const savePreferences = async () => {
    if (!userId) return;
    setIsSaving(true);
    try {
      const { error } = await updateUserPreferences(userId, prefs);
      if (error) throw error;
      toast({ title: 'Preferences saved' });
    } catch (error) {
      toast({ title: 'Save failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const changePassword = async () => {
    if (password.length < 8) {
      toast({ title: 'Password too short', description: 'Use at least 8 characters.', variant: 'destructive' });
      return;
    }
    setIsSaving(true);
    try {
      const { error } = await updatePassword(password);
      if (error) throw error;
      setPassword('');
      toast({ title: 'Password updated' });
    } catch (error) {
      toast({ title: 'Update failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const deleteAccount = async () => {
    toast({
      title: 'Account deletion requires support',
      description: 'For safety, account deletion is performed by the administrator. Contact support with your account email.',
      variant: 'destructive',
      duration: 8000,
    });
  };

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your profile, detection preferences, and privacy.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Full name</Label>
              <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" />
            </div>
            <Button onClick={saveProfile} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save profile
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Change password</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="newpass">New password</Label>
              <Input id="newpass" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button onClick={changePassword} disabled={isSaving || !password}>
              Update password
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Detection preferences</CardTitle>
            <CardDescription>Defaults applied to new detection sessions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Inference mode</Label>
                <Select value={prefs.inference_mode} onValueChange={(v) => setPrefs((p) => ({ ...p, inference_mode: v as 'auto' | 'browser' | 'cloud' }))}>
                  <SelectTrigger aria-label="Inference mode"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto</SelectItem>
                    <SelectItem value="browser">Browser</SelectItem>
                    <SelectItem value="cloud">Cloud</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Inference FPS</Label>
                <Select value={String(prefs.inference_fps)} onValueChange={(v) => setPrefs((p) => ({ ...p, inference_fps: Number(v) }))}>
                  <SelectTrigger aria-label="Inference FPS"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[3, 5, 10, 15].map((n) => <SelectItem key={n} value={String(n)}>{n} FPS</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Confidence threshold</Label>
                <Select value={String(prefs.confidence_threshold)} onValueChange={(v) => setPrefs((p) => ({ ...p, confidence_threshold: Number(v) }))}>
                  <SelectTrigger aria-label="Confidence threshold"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[0.1, 0.25, 0.4, 0.5, 0.7].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="gps">Use GPS location</Label>
                <p className="text-xs text-muted-foreground">Location is only recorded when this is on and you grant permission.</p>
              </div>
              <Switch id="gps" checked={prefs.enable_gps} onCheckedChange={(v) => setPrefs((p) => ({ ...p, enable_gps: v }))} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="autosave">Auto-save detections</Label>
                <p className="text-xs text-muted-foreground">Persist confirmed tracks without manual review.</p>
              </div>
              <Switch id="autosave" checked={prefs.auto_save_detections} onCheckedChange={(v) => setPrefs((p) => ({ ...p, auto_save_detections: v }))} />
            </div>
            <Button onClick={savePreferences} disabled={isSaving}>Save preferences</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Privacy</CardTitle>
            <CardDescription>
              Camera frames are used only for detection. With browser inference, frames never leave your device;
              with cloud inference, sampled frames are sent to the AI service. You can delete any detection from its detail page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={deleteAccount}>Delete account</Button>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
