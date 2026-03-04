'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Divider,
  Input,
  Select,
  SelectItem,
  Tabs,
  Tab,
} from '@heroui/react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

type AppRole =
  | 'admin'
  | 'rcm'
  | 'event-manager'
  | 'reception'
  | 'trainer'
  | 'gear-manager'
  | 'track-manager';

type EventItem = {
  id: string;
  name: string;
  location: string;
  date: string;
  slug: string;
  eventManagerEmail: string;
  createdBy: string;
  createdAt: number;
};

type EventUser = {
  id: string;
  eventId: string;
  email: string;
  role: AppRole;
  createdAt: number;
};

type RoleUser = {
  id: string;
  email: string;
  role: AppRole;
  createdAt: number;
};

type Participant = {
  id: string;
  eventId: string;
  name: string;
  contactNumber: string;
  email: string;
  bikeOwned: string;
  createdAt: number;
  trainedAt?: number;
  gearAllocatedAt?: number;
  trackEnteredAt?: number;
  trackExitedAt?: number;
  gearReturnedAt?: number;
};

type ConsoleView =
  | 'operations'
  | 'admin-users'
  | 'admin-events'
  | 'admin-reports'
  | 'manager-events'
  | 'manager-team';

const roleOptions: { key: AppRole; label: string }[] = [
  { key: 'admin', label: 'Admin' },
  { key: 'rcm', label: 'RCM' },
  { key: 'event-manager', label: 'Event Manager' },
  { key: 'reception', label: 'Reception' },
  { key: 'trainer', label: 'Trainer' },
  { key: 'gear-manager', label: 'Gear Manager' },
  { key: 'track-manager', label: 'Track Manager' },
];

const managerProfileRoles: AppRole[] = ['reception', 'trainer', 'gear-manager', 'track-manager'];

function emailKey(email: string): string {
  return email.trim().toLowerCase().replaceAll('.', ',');
}

function roleLabel(role: AppRole): string {
  return roleOptions.find((item) => item.key === role)?.label ?? role;
}

function toSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function stage(item: Participant): string {
  if (item.gearReturnedAt) return 'returned-gears';
  if (item.trackExitedAt) return 'track-completed';
  if (item.trackEnteredAt) return 'on-track';
  if (item.gearAllocatedAt) return 'in-line';
  if (item.trainedAt) return 'trained';
  return 'registered';
}

function csvEscape(value: string | number): string {
  const text = String(value ?? '');
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

export default function TrackManPage() {
  const [origin, setOrigin] = useState('');
  const [tab, setTab] = useState<'public' | 'console'>('public');
  const [view, setView] = useState<ConsoleView>('operations');

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [globalRole, setGlobalRole] = useState<AppRole | null>(null);

  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const [events, setEvents] = useState<EventItem[]>([]);
  const [users, setUsers] = useState<RoleUser[]>([]);
  const [eventUsers, setEventUsers] = useState<EventUser[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);

  const [selectedEventId, setSelectedEventId] = useState('');
  const [publicSlug, setPublicSlug] = useState('');

  const [eventName, setEventName] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventManagerEmail, setEventManagerEmail] = useState('');

  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<AppRole>('reception');

  const [teamEventId, setTeamEventId] = useState('');
  const [teamEmail, setTeamEmail] = useState('');
  const [teamPassword, setTeamPassword] = useState('');
  const [teamRole, setTeamRole] = useState<AppRole>('reception');

  const [participantEventId, setParticipantEventId] = useState('');
  const [participantName, setParticipantName] = useState('');
  const [participantContact, setParticipantContact] = useState('');
  const [participantEmail, setParticipantEmail] = useState('');
  const [participantBikeOwned, setParticipantBikeOwned] = useState('');

  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
    const params = new URLSearchParams(window.location.search);
    setPublicSlug(params.get('event')?.toLowerCase() ?? '');
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (!user?.email) {
        setGlobalRole(null);
        return;
      }
      return onSnapshot(doc(db, 'users', emailKey(user.email)), (snap) => {
        if (!snap.exists()) {
          setGlobalRole(null);
          return;
        }
        const data = snap.data() as { role?: AppRole };
        setGlobalRole(data.role ?? null);
      });
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'events'), orderBy('createdAt', 'asc')), (snap) => {
      const rows: EventItem[] = snap.docs.map((d) => {
        const data = d.data() as Omit<EventItem, 'id'>;
        return {
          id: d.id,
          name: data.name,
          location: data.location,
          date: data.date,
          slug: data.slug,
          eventManagerEmail: data.eventManagerEmail,
          createdBy: data.createdBy,
          createdAt: Number(data.createdAt ?? Date.now()),
        };
      });
      setEvents(rows);
      if (!selectedEventId && rows.length > 0) setSelectedEventId(rows[0].id);
      if (!teamEventId && rows.length > 0) setTeamEventId(rows[0].id);
      if (!participantEventId && rows.length > 0) setParticipantEventId(rows[0].id);
    });

    return () => unsub();
  }, [participantEventId, selectedEventId, teamEventId]);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'users'), orderBy('createdAt', 'asc')), (snap) => {
      const rows: RoleUser[] = snap.docs.map((d) => {
        const data = d.data() as Omit<RoleUser, 'id'>;
        return {
          id: d.id,
          email: data.email,
          role: data.role,
          createdAt: Number(data.createdAt ?? Date.now()),
        };
      });
      setUsers(rows);
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'eventUsers'), (snap) => {
      const rows: EventUser[] = snap.docs.map((d) => {
        const data = d.data() as Omit<EventUser, 'id'>;
        return {
          id: d.id,
          eventId: data.eventId,
          email: data.email,
          role: data.role,
          createdAt: Number(data.createdAt ?? Date.now()),
        };
      });
      setEventUsers(rows);
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (!selectedEventId) {
      setParticipants([]);
      return;
    }

    const q = query(collection(db, 'participants'), where('eventId', '==', selectedEventId));
    const unsub = onSnapshot(q, (snap) => {
      const rows: Participant[] = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Participant, 'id'>) }))
        .sort((a, b) => Number(a.createdAt ?? 0) - Number(b.createdAt ?? 0));
      setParticipants(rows);
    });

    return () => unsub();
  }, [selectedEventId]);

  useEffect(() => {
    if (!publicSlug || events.length === 0) return;
    const event = events.find((item) => item.slug === publicSlug);
    if (event) setSelectedEventId(event.id);
  }, [events, publicSlug]);

  const currentEmail = currentUser?.email?.toLowerCase() ?? '';

  const myEventRoles = useMemo(() => {
    if (!currentEmail) return [] as AppRole[];
    return eventUsers.filter((item) => item.email === currentEmail).map((item) => item.role);
  }, [currentEmail, eventUsers]);

  const effectiveRoles = useMemo(() => {
    const set = new Set<AppRole>();
    if (globalRole) set.add(globalRole);
    myEventRoles.forEach((r) => set.add(r));
    return Array.from(set);
  }, [globalRole, myEventRoles]);

  const hasRole = (role: AppRole) => effectiveRoles.includes(role);

  const isAdmin = hasRole('admin');
  const isRcm = hasRole('rcm');
  const isEventManager = hasRole('event-manager');

  const canManageEvents = isAdmin || isRcm;
  const canReception = isAdmin || hasRole('reception');
  const canTrainer = isAdmin || hasRole('trainer');
  const canGear = isAdmin || hasRole('gear-manager');
  const canTrack = isAdmin || hasRole('track-manager');

  const selectedEvent = useMemo(() => events.find((item) => item.id === selectedEventId) ?? null, [events, selectedEventId]);
  const managerEvents = useMemo(
    () => events.filter((item) => item.eventManagerEmail === currentEmail),
    [currentEmail, events]
  );

  const canManageTeamForEvent = (eventId: string): boolean => {
    if (isAdmin) return true;
    if (!isEventManager) return false;
    const event = events.find((item) => item.id === eventId);
    return Boolean(event && event.eventManagerEmail === currentEmail);
  };

  useEffect(() => {
    if (!isEventManager) return;
    if (managerEvents.length === 0) return;
    if (!teamEventId || !managerEvents.some((item) => item.id === teamEventId)) {
      setTeamEventId(managerEvents[0].id);
    }
  }, [isEventManager, managerEvents, teamEventId]);

  const teamMembers = useMemo(() => {
    if (!teamEventId) return [] as EventUser[];
    return eventUsers.filter((item) => item.eventId === teamEventId);
  }, [eventUsers, teamEventId]);

  const publicEvent = useMemo(() => {
    if (!publicSlug) return null;
    return events.find((item) => item.slug === publicSlug) ?? null;
  }, [events, publicSlug]);

  const publicMetrics = useMemo(() => {
    const totalRegistered = participants.length;
    const totalTrained = participants.filter((p) => Boolean(p.trainedAt)).length;
    const trackCompleted = participants.filter((p) => Boolean(p.trackExitedAt)).length;
    const nextFiveTraining = participants.filter((p) => !p.trainedAt).slice(0, 5);

    return { totalRegistered, totalTrained, trackCompleted, nextFiveTraining };
  }, [participants]);

  const eventManagerOptions = users.filter((item) => item.role === 'event-manager');

  const login = async () => {
    try {
      setError('');
      setAuthError('');
      await signInWithEmailAndPassword(auth, authEmail.trim(), authPassword);
      setTab('console');
    } catch {
      setAuthError('login failed. check email and password');
    }
  };

  const createAuthUser = async (email: string, password: string, role: AppRole): Promise<boolean> => {
    if (!currentUser) {
      setError('login required');
      return false;
    }

    const token = await currentUser.getIdToken();
    const res = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ email: email.toLowerCase(), password, role }),
    });

    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? 'unable to create user');
      return false;
    }

    return true;
  };

  const createGlobalUser = async () => {
    if (!isAdmin) return;
    setError('');
    setNotice('');

    if (!newUserEmail.trim() || !newUserPassword.trim()) {
      setError('email and password required');
      return;
    }

    const ok = await createAuthUser(newUserEmail.trim().toLowerCase(), newUserPassword, newUserRole);
    if (!ok) return;

    setNotice('user created');
    setNewUserEmail('');
    setNewUserPassword('');
    setNewUserRole('reception');
  };

  const removeGlobalUser = async (id: string) => {
    if (!isAdmin) return;
    await deleteDoc(doc(db, 'users', id));
    setNotice('role removed');
  };

  const createEvent = async () => {
    if (!canManageEvents || !currentEmail) return;
    setError('');

    const nextName = eventName.trim();
    const nextLocation = eventLocation.trim();
    const nextDate = eventDate;
    const nextManager = eventManagerEmail.trim().toLowerCase();

    if (!nextName || !nextLocation || !nextDate || !nextManager) {
      setError('event name, location, date, and event manager are required');
      return;
    }

    await addDoc(collection(db, 'events'), {
      name: nextName,
      location: nextLocation,
      date: nextDate,
      slug: toSlug(nextName),
      eventManagerEmail: nextManager,
      createdBy: currentEmail,
      createdAt: Date.now(),
    });

    setNotice('event created');
    setEventName('');
    setEventLocation('');
    setEventDate('');
    setEventManagerEmail('');
  };

  const loadSelectedEvent = () => {
    if (!selectedEvent) return;
    setEventName(selectedEvent.name);
    setEventLocation(selectedEvent.location);
    setEventDate(selectedEvent.date);
    setEventManagerEmail(selectedEvent.eventManagerEmail);
  };

  const updateEvent = async () => {
    if (!selectedEvent || !currentEmail) return;

    const owner = selectedEvent.createdBy === currentEmail;
    if (!isAdmin && !(isRcm && owner)) {
      setError('you can edit only events created by you');
      return;
    }

    await updateDoc(doc(db, 'events', selectedEvent.id), {
      name: eventName.trim() || selectedEvent.name,
      location: eventLocation.trim() || selectedEvent.location,
      date: eventDate || selectedEvent.date,
      eventManagerEmail: (eventManagerEmail.trim() || selectedEvent.eventManagerEmail).toLowerCase(),
      slug: toSlug(eventName.trim() || selectedEvent.name),
    });

    setNotice('event updated');
  };

  const upsertTeamProfile = async () => {
    if (!teamEventId || !teamEmail.trim() || !teamRole) return;
    if (!canManageTeamForEvent(teamEventId)) {
      setError('you cannot manage this event team');
      return;
    }

    setError('');
    setNotice('');

    const lowerEmail = teamEmail.trim().toLowerCase();

    if (teamPassword.trim()) {
      const ok = await createAuthUser(lowerEmail, teamPassword, teamRole);
      if (!ok) return;
    }

    await setDoc(
      doc(db, 'users', emailKey(lowerEmail)),
      {
        email: lowerEmail,
        role: teamRole,
        createdAt: Date.now(),
      },
      { merge: true }
    );

    await setDoc(doc(db, 'eventUsers', `${teamEventId}__${emailKey(lowerEmail)}`), {
      eventId: teamEventId,
      email: lowerEmail,
      role: teamRole,
      createdAt: Date.now(),
    });

    setNotice('team profile saved');
    setTeamEmail('');
    setTeamPassword('');
    setTeamRole('reception');
  };

  const deleteTeamProfile = async (member: EventUser) => {
    if (!canManageTeamForEvent(member.eventId)) {
      setError('you cannot delete this profile');
      return;
    }

    await deleteDoc(doc(db, 'eventUsers', member.id));
    await deleteDoc(doc(db, 'users', emailKey(member.email)));
    setNotice('profile removed from this app');
  };

  const registerParticipant = async () => {
    if (!canReception || !participantEventId) return;
    if (!participantName.trim() || !participantContact.trim() || !participantEmail.trim() || !participantBikeOwned.trim()) {
      setError('all participant fields are required');
      return;
    }

    await addDoc(collection(db, 'participants'), {
      eventId: participantEventId,
      name: participantName.trim(),
      contactNumber: participantContact.trim(),
      email: participantEmail.trim().toLowerCase(),
      bikeOwned: participantBikeOwned.trim(),
      createdAt: Date.now(),
    });

    setNotice('participant registered');
    setParticipantName('');
    setParticipantContact('');
    setParticipantEmail('');
    setParticipantBikeOwned('');
  };

  const markTrained = async (id: string) => {
    if (!canTrainer) return;
    await updateDoc(doc(db, 'participants', id), { trainedAt: Date.now() });
  };

  const allocateGear = async (id: string) => {
    if (!canGear) return;
    await updateDoc(doc(db, 'participants', id), { gearAllocatedAt: Date.now() });
  };

  const markTrackEntry = async (id: string) => {
    if (!canTrack) return;
    await updateDoc(doc(db, 'participants', id), { trackEnteredAt: Date.now() });
  };

  const markTrackExit = async (id: string) => {
    if (!canTrack) return;
    await updateDoc(doc(db, 'participants', id), { trackExitedAt: Date.now() });
  };

  const markGearReturn = async (id: string) => {
    if (!canGear) return;
    await updateDoc(doc(db, 'participants', id), { gearReturnedAt: Date.now() });
  };

  const exportCsv = async (scope: 'total' | 'event') => {
    if (!isAdmin) return;

    let rows: Participant[] = [];
    if (scope === 'event' && selectedEventId) {
      const snap = await getDocs(query(collection(db, 'participants'), where('eventId', '==', selectedEventId)));
      rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Participant, 'id'>) }));
    } else {
      const snap = await getDocs(collection(db, 'participants'));
      rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Participant, 'id'>) }));
    }

    const eventMap = new Map(events.map((item) => [item.id, item.name]));

    const header = [
      'event',
      'name',
      'contact_number',
      'email',
      'bike_owned',
      'registered_at',
      'trained_at',
      'gear_allocated_at',
      'track_entered_at',
      'track_exited_at',
      'gear_returned_at',
    ];

    const lines = rows
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
      .map((item) =>
        [
          csvEscape(eventMap.get(item.eventId) ?? item.eventId),
          csvEscape(item.name),
          csvEscape(item.contactNumber),
          csvEscape(item.email),
          csvEscape(item.bikeOwned),
          csvEscape(item.createdAt ?? ''),
          csvEscape(item.trainedAt ?? ''),
          csvEscape(item.gearAllocatedAt ?? ''),
          csvEscape(item.trackEnteredAt ?? ''),
          csvEscape(item.trackExitedAt ?? ''),
          csvEscape(item.gearReturnedAt ?? ''),
        ].join(',')
      );

    const csvText = `${header.join(',')}\n${lines.join('\n')}`;
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = scope === 'event' ? `event-${selectedEvent?.slug ?? 'data'}.csv` : 'all-events.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const sidebarItems: { id: ConsoleView; label: string; show: boolean }[] = [
    { id: 'operations', label: 'operations', show: true },
    { id: 'admin-users', label: 'admin users', show: isAdmin },
    { id: 'admin-events', label: 'admin events', show: canManageEvents },
    { id: 'admin-reports', label: 'admin reports', show: isAdmin },
    { id: 'manager-events', label: 'my events', show: isEventManager },
    { id: 'manager-team', label: 'event team', show: isEventManager || isAdmin },
  ];

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 font-[family-name:var(--font-manrope)] text-slate-900 md:px-8">
      <div className="mx-auto max-w-6xl space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">track man</p>
          <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="font-[family-name:var(--font-space-grotesk)] text-4xl font-semibold">event operations</h1>
              <p className="text-sm text-slate-500">clean and focused workflow</p>
            </div>
            <Tabs selectedKey={tab} onSelectionChange={(key) => setTab(key as 'public' | 'console')} variant="bordered" radius="full">
              <Tab key="public" title="Public" />
              <Tab key="console" title="Console" />
            </Tabs>
          </div>
        </section>

        {notice ? (
          <Card className="border border-emerald-200 bg-emerald-50">
            <CardBody className="text-sm text-emerald-700">{notice}</CardBody>
          </Card>
        ) : null}

        {error ? (
          <Card className="border border-rose-200 bg-rose-50">
            <CardBody className="text-sm text-rose-700">{error}</CardBody>
          </Card>
        ) : null}

        {tab === 'public' ? (
          <section className="space-y-4">
            {!publicSlug ? (
              <Card className="border border-slate-200 bg-white">
                <CardBody className="text-sm text-slate-600">
                  public page is event specific. open this format: <span className="font-medium">{origin}/?event=event-slug</span>
                </CardBody>
              </Card>
            ) : !publicEvent ? (
              <Card className="border border-rose-200 bg-rose-50">
                <CardBody className="text-sm text-rose-700">event link not valid</CardBody>
              </Card>
            ) : (
              <>
                <Card className="border border-slate-200 bg-white">
                  <CardHeader>
                    <div>
                      <h2 className="text-2xl font-semibold">{publicEvent.name}</h2>
                      <p className="text-sm text-slate-500">
                        {publicEvent.location} | {publicEvent.date}
                      </p>
                    </div>
                  </CardHeader>
                </Card>

                <div className="grid gap-3 md:grid-cols-3">
                  <Card className="border border-slate-200 bg-white">
                    <CardBody>
                      <p className="text-sm text-slate-500">total registered</p>
                      <p className="text-3xl font-semibold">{publicMetrics.totalRegistered}</p>
                    </CardBody>
                  </Card>
                  <Card className="border border-slate-200 bg-white">
                    <CardBody>
                      <p className="text-sm text-slate-500">total trained</p>
                      <p className="text-3xl font-semibold">{publicMetrics.totalTrained}</p>
                    </CardBody>
                  </Card>
                  <Card className="border border-slate-200 bg-white">
                    <CardBody>
                      <p className="text-sm text-slate-500">track completed</p>
                      <p className="text-3xl font-semibold">{publicMetrics.trackCompleted}</p>
                    </CardBody>
                  </Card>
                </div>

                <Card className="border border-slate-200 bg-white">
                  <CardHeader>
                    <h3 className="text-lg font-semibold">next 5 in line for training</h3>
                  </CardHeader>
                  <Divider />
                  <CardBody className="space-y-2">
                    {publicMetrics.nextFiveTraining.length === 0 ? (
                      <p className="text-sm text-slate-500">no one waiting for training</p>
                    ) : (
                      publicMetrics.nextFiveTraining.map((item) => (
                        <div key={item.id} className="rounded-lg border border-slate-200 px-3 py-2">
                          <p className="font-medium">{item.name}</p>
                        </div>
                      ))
                    )}
                  </CardBody>
                </Card>
              </>
            )}
          </section>
        ) : (
          <section>
            {!currentUser ? (
              <Card className="mx-auto max-w-md border border-slate-200 bg-white">
                <CardHeader>
                  <h2 className="text-xl font-semibold">login</h2>
                </CardHeader>
                <CardBody className="space-y-3">
                  <Input label="email" type="email" value={authEmail} onValueChange={setAuthEmail} />
                  <Input label="password" type="password" value={authPassword} onValueChange={setAuthPassword} />
                  {authError ? <p className="text-sm text-rose-600">{authError}</p> : null}
                  <Button color="primary" onPress={login}>
                    Sign In
                  </Button>
                </CardBody>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-[220px_1fr]">
                <Card className="border border-slate-200 bg-white">
                  <CardHeader>
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">console</p>
                      <p className="mt-1 text-sm text-slate-600">{currentUser.email}</p>
                    </div>
                  </CardHeader>
                  <Divider />
                  <CardBody className="space-y-2">
                    {effectiveRoles.length === 0 ? (
                      <Chip color="warning" variant="flat">
                        no role assigned
                      </Chip>
                    ) : (
                      effectiveRoles.map((r) => (
                        <Chip key={r} color="primary" variant="flat">
                          {roleLabel(r)}
                        </Chip>
                      ))
                    )}
                    <Divider className="my-2" />
                    {sidebarItems
                      .filter((item) => item.show)
                      .map((item) => (
                        <Button
                          key={item.id}
                          variant={view === item.id ? 'solid' : 'flat'}
                          color={view === item.id ? 'primary' : 'default'}
                          onPress={() => setView(item.id)}
                          className="justify-start"
                        >
                          {item.label}
                        </Button>
                      ))}
                    <Divider className="my-2" />
                    <Button variant="light" onPress={() => signOut(auth)}>
                      Sign Out
                    </Button>
                  </CardBody>
                </Card>

                <div className="space-y-4">
                  {view === 'operations' ? (
                    <>
                      <Card className="border border-slate-200 bg-white">
                        <CardHeader>
                          <h3 className="text-lg font-semibold">participant registration</h3>
                        </CardHeader>
                        <CardBody className="grid gap-3 md:grid-cols-5">
                          <Select
                            label="event"
                            selectedKeys={participantEventId ? [participantEventId] : []}
                            onSelectionChange={(keys) => {
                              const first = Array.from(keys)[0];
                              if (typeof first === 'string') {
                                setParticipantEventId(first);
                                setSelectedEventId(first);
                              }
                            }}
                          >
                            {events.map((event) => (
                              <SelectItem key={event.id}>{event.name}</SelectItem>
                            ))}
                          </Select>
                          <Input label="name" value={participantName} onValueChange={setParticipantName} />
                          <Input label="contact number" value={participantContact} onValueChange={setParticipantContact} />
                          <Input label="email id" type="email" value={participantEmail} onValueChange={setParticipantEmail} />
                          <Input label="bike owned" value={participantBikeOwned} onValueChange={setParticipantBikeOwned} />
                        </CardBody>
                        <CardBody className="pt-0">
                          <Button color="primary" onPress={registerParticipant} isDisabled={!canReception}>
                            Register Participant
                          </Button>
                        </CardBody>
                      </Card>

                      <Card className="border border-slate-200 bg-white">
                        <CardHeader className="flex items-center justify-between">
                          <h3 className="text-lg font-semibold">participant flow</h3>
                          <Select
                            label="event"
                            className="max-w-xs"
                            selectedKeys={selectedEventId ? [selectedEventId] : []}
                            onSelectionChange={(keys) => {
                              const first = Array.from(keys)[0];
                              if (typeof first === 'string') {
                                setSelectedEventId(first);
                              }
                            }}
                          >
                            {events.map((event) => (
                              <SelectItem key={event.id}>{event.name}</SelectItem>
                            ))}
                          </Select>
                        </CardHeader>
                        <Divider />
                        <CardBody className="space-y-2">
                          {participants.length === 0 ? (
                            <p className="text-sm text-slate-500">no participants in selected event</p>
                          ) : (
                            participants.map((item) => (
                              <div key={item.id} className="space-y-2 rounded-lg border border-slate-200 p-3 md:flex md:items-center md:justify-between md:space-y-0">
                                <div>
                                  <p className="font-medium">{item.name}</p>
                                  <p className="text-xs text-slate-500">
                                    {item.contactNumber} | {item.email} | {item.bikeOwned}
                                  </p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <Chip variant="flat">{stage(item)}</Chip>
                                  {!item.trainedAt ? (
                                    <Button size="sm" variant="flat" onPress={() => markTrained(item.id)} isDisabled={!canTrainer}>
                                      trained
                                    </Button>
                                  ) : null}
                                  {item.trainedAt && !item.gearAllocatedAt ? (
                                    <Button size="sm" variant="flat" onPress={() => allocateGear(item.id)} isDisabled={!canGear}>
                                      allocate gear
                                    </Button>
                                  ) : null}
                                  {item.gearAllocatedAt && !item.trackEnteredAt ? (
                                    <Button size="sm" variant="flat" onPress={() => markTrackEntry(item.id)} isDisabled={!canTrack}>
                                      track entry
                                    </Button>
                                  ) : null}
                                  {item.trackEnteredAt && !item.trackExitedAt ? (
                                    <Button size="sm" variant="flat" onPress={() => markTrackExit(item.id)} isDisabled={!canTrack}>
                                      track exit
                                    </Button>
                                  ) : null}
                                  {item.trackExitedAt && !item.gearReturnedAt ? (
                                    <Button size="sm" variant="flat" onPress={() => markGearReturn(item.id)} isDisabled={!canGear}>
                                      return gear
                                    </Button>
                                  ) : null}
                                </div>
                              </div>
                            ))
                          )}
                        </CardBody>
                      </Card>
                    </>
                  ) : null}

                  {view === 'admin-users' ? (
                    <Card className="border border-slate-200 bg-white">
                      <CardHeader>
                        <h3 className="text-lg font-semibold">admin users</h3>
                      </CardHeader>
                      <CardBody className="grid gap-3 md:grid-cols-4">
                        <Input label="email" value={newUserEmail} onValueChange={setNewUserEmail} />
                        <Input label="password" type="password" value={newUserPassword} onValueChange={setNewUserPassword} />
                        <Select
                          label="role"
                          selectedKeys={[newUserRole]}
                          onSelectionChange={(keys) => {
                            const first = Array.from(keys)[0];
                            if (typeof first === 'string') setNewUserRole(first as AppRole);
                          }}
                        >
                          {roleOptions.map((option) => (
                            <SelectItem key={option.key}>{option.label}</SelectItem>
                          ))}
                        </Select>
                        <Button className="md:mt-6" color="primary" onPress={createGlobalUser}>
                          Create User
                        </Button>
                      </CardBody>
                      <Divider />
                      <CardBody className="space-y-2">
                        {users.map((item) => (
                          <div key={item.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                            <div>
                              <p className="font-medium">{item.email}</p>
                              <p className="text-xs text-slate-500">{roleLabel(item.role)}</p>
                            </div>
                            <Button size="sm" color="danger" variant="flat" onPress={() => removeGlobalUser(item.id)}>
                              Remove
                            </Button>
                          </div>
                        ))}
                      </CardBody>
                    </Card>
                  ) : null}

                  {view === 'admin-events' ? (
                    <Card className="border border-slate-200 bg-white">
                      <CardHeader>
                        <h3 className="text-lg font-semibold">admin events</h3>
                      </CardHeader>
                      <CardBody className="space-y-3">
                        <Select
                          label="selected event"
                          selectedKeys={selectedEventId ? [selectedEventId] : []}
                          onSelectionChange={(keys) => {
                            const first = Array.from(keys)[0];
                            if (typeof first === 'string') setSelectedEventId(first);
                          }}
                        >
                          {events.map((event) => (
                            <SelectItem key={event.id}>{event.name}</SelectItem>
                          ))}
                        </Select>
                        <div className="grid gap-3 md:grid-cols-4">
                          <Input label="event name" value={eventName} onValueChange={setEventName} />
                          <Input label="event location" value={eventLocation} onValueChange={setEventLocation} />
                          <Input label="date" type="date" value={eventDate} onValueChange={setEventDate} />
                          <Select
                            label="event manager"
                            selectedKeys={eventManagerEmail ? [eventManagerEmail] : []}
                            onSelectionChange={(keys) => {
                              const first = Array.from(keys)[0];
                              if (typeof first === 'string') setEventManagerEmail(first);
                            }}
                          >
                            {eventManagerOptions.map((option) => (
                              <SelectItem key={option.email}>{option.email}</SelectItem>
                            ))}
                          </Select>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button color="primary" onPress={createEvent}>
                            Create Event
                          </Button>
                          <Button variant="flat" onPress={loadSelectedEvent}>
                            Load Selected
                          </Button>
                          <Button color="warning" variant="flat" onPress={updateEvent}>
                            Update Selected
                          </Button>
                        </div>
                      </CardBody>
                    </Card>
                  ) : null}

                  {view === 'admin-reports' ? (
                    <Card className="border border-slate-200 bg-white">
                      <CardHeader>
                        <h3 className="text-lg font-semibold">admin reports</h3>
                      </CardHeader>
                      <CardBody className="space-y-3">
                        <Select
                          label="event"
                          selectedKeys={selectedEventId ? [selectedEventId] : []}
                          onSelectionChange={(keys) => {
                            const first = Array.from(keys)[0];
                            if (typeof first === 'string') setSelectedEventId(first);
                          }}
                        >
                          {events.map((event) => (
                            <SelectItem key={event.id}>{event.name}</SelectItem>
                          ))}
                        </Select>
                        <div className="flex flex-wrap gap-2">
                          <Button color="success" onPress={() => exportCsv('event')}>
                            download event csv
                          </Button>
                          <Button variant="flat" onPress={() => exportCsv('total')}>
                            download total csv
                          </Button>
                        </div>
                      </CardBody>
                    </Card>
                  ) : null}

                  {view === 'manager-events' ? (
                    <Card className="border border-slate-200 bg-white">
                      <CardHeader>
                        <h3 className="text-lg font-semibold">events assigned to me</h3>
                      </CardHeader>
                      <CardBody className="space-y-2">
                        {managerEvents.length === 0 ? (
                          <p className="text-sm text-slate-500">no events assigned to your event manager profile</p>
                        ) : (
                          managerEvents.map((event) => (
                            <div key={event.id} className="rounded-lg border border-slate-200 px-3 py-2">
                              <p className="font-medium">{event.name}</p>
                              <p className="text-xs text-slate-500">
                                {event.location} | {event.date} | /?event={event.slug}
                              </p>
                            </div>
                          ))
                        )}
                      </CardBody>
                    </Card>
                  ) : null}

                  {view === 'manager-team' ? (
                    <Card className="border border-slate-200 bg-white">
                      <CardHeader>
                        <h3 className="text-lg font-semibold">event team profiles</h3>
                      </CardHeader>
                      <CardBody className="space-y-3">
                        <Select
                          label="event"
                          selectedKeys={teamEventId ? [teamEventId] : []}
                          onSelectionChange={(keys) => {
                            const first = Array.from(keys)[0];
                            if (typeof first === 'string') setTeamEventId(first);
                          }}
                        >
                          {(isAdmin ? events : managerEvents).map((event) => (
                            <SelectItem key={event.id}>{event.name}</SelectItem>
                          ))}
                        </Select>

                        <div className="grid gap-3 md:grid-cols-4">
                          <Input label="email" value={teamEmail} onValueChange={setTeamEmail} />
                          <Input
                            label="password (required for new user)"
                            type="password"
                            value={teamPassword}
                            onValueChange={setTeamPassword}
                          />
                          <Select
                            label="role"
                            selectedKeys={[teamRole]}
                            onSelectionChange={(keys) => {
                              const first = Array.from(keys)[0];
                              if (typeof first === 'string') setTeamRole(first as AppRole);
                            }}
                          >
                            {managerProfileRoles.map((role) => (
                              <SelectItem key={role}>{roleLabel(role)}</SelectItem>
                            ))}
                          </Select>
                          <Button className="md:mt-6" color="primary" onPress={upsertTeamProfile}>
                            Create / Update Profile
                          </Button>
                        </div>

                        <Divider />
                        <div className="space-y-2">
                          {teamMembers.length === 0 ? (
                            <p className="text-sm text-slate-500">no team members in this event yet</p>
                          ) : (
                            teamMembers.map((member) => (
                              <div key={member.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                                <div>
                                  <p className="font-medium">{member.email}</p>
                                  <p className="text-xs text-slate-500">{roleLabel(member.role)}</p>
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    variant="flat"
                                    onPress={() => {
                                      setTeamEmail(member.email);
                                      setTeamRole(member.role);
                                      setTeamPassword('');
                                    }}
                                  >
                                    Modify
                                  </Button>
                                  <Button size="sm" color="danger" variant="flat" onPress={() => deleteTeamProfile(member)}>
                                    Delete
                                  </Button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </CardBody>
                    </Card>
                  ) : null}
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
