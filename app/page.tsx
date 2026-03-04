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

const roleOptions: { key: AppRole; label: string }[] = [
  { key: 'admin', label: 'Admin' },
  { key: 'rcm', label: 'RCM' },
  { key: 'event-manager', label: 'Event Manager' },
  { key: 'reception', label: 'Reception' },
  { key: 'trainer', label: 'Trainer' },
  { key: 'gear-manager', label: 'Gear Manager' },
  { key: 'track-manager', label: 'Track Manager' },
];

const teamAssignableRoles: AppRole[] = ['event-manager', 'reception', 'trainer', 'gear-manager', 'track-manager'];

function emailKey(email: string): string {
  return email.trim().toLowerCase().replaceAll('.', ',');
}

function toSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function roleLabel(role: AppRole): string {
  return roleOptions.find((item) => item.key === role)?.label ?? role;
}

function stage(item: Participant): 'registered' | 'trained' | 'track-completed' | 'in-line' {
  if (item.trackExitedAt) return 'track-completed';
  if (item.gearAllocatedAt && !item.trackEnteredAt) return 'in-line';
  if (item.trainedAt) return 'trained';
  return 'registered';
}

function csvEscape(value: string | number): string {
  const text = String(value);
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

export default function TrackManPage() {
  const [origin, setOrigin] = useState('');
  const [tab, setTab] = useState<'public' | 'console'>('public');

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [globalRole, setGlobalRole] = useState<AppRole | null>(null);

  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const [events, setEvents] = useState<EventItem[]>([]);
  const [users, setUsers] = useState<RoleUser[]>([]);
  const [eventUsers, setEventUsers] = useState<EventUser[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);

  const [publicSlug, setPublicSlug] = useState('');
  const [selectedEventId, setSelectedEventId] = useState('');

  const [eventName, setEventName] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventManagerEmail, setEventManagerEmail] = useState('');

  const [newGlobalEmail, setNewGlobalEmail] = useState('');
  const [newGlobalPassword, setNewGlobalPassword] = useState('');
  const [newGlobalRole, setNewGlobalRole] = useState<AppRole>('reception');

  const [assignEventId, setAssignEventId] = useState('');
  const [assignEmail, setAssignEmail] = useState('');
  const [assignPassword, setAssignPassword] = useState('');
  const [assignRole, setAssignRole] = useState<AppRole>('reception');

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
          eventManagerEmail: data.eventManagerEmail ?? '',
          createdBy: data.createdBy,
          createdAt: Number(data.createdAt ?? Date.now()),
        };
      });
      setEvents(rows);
      if (!selectedEventId && rows.length > 0) setSelectedEventId(rows[0].id);
      if (!assignEventId && rows.length > 0) setAssignEventId(rows[0].id);
      if (!participantEventId && rows.length > 0) setParticipantEventId(rows[0].id);
    });
    return () => unsub();
  }, [assignEventId, participantEventId, selectedEventId]);

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
        .sort((a, b) => Number(a.createdAt) - Number(b.createdAt));
      setParticipants(rows);
    });
    return () => unsub();
  }, [selectedEventId]);

  useEffect(() => {
    const event = events.find((item) => item.slug === publicSlug);
    if (event) setSelectedEventId(event.id);
  }, [events, publicSlug]);

  const selectedEvent = useMemo(() => events.find((item) => item.id === selectedEventId) ?? null, [events, selectedEventId]);

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
  const canAssignTeam = isAdmin || isEventManager;
  const canReception = isAdmin || hasRole('reception');
  const canTrainer = isAdmin || hasRole('trainer');
  const canGear = isAdmin || hasRole('gear-manager');
  const canTrack = isAdmin || hasRole('track-manager');

  const eventManagerOptions = users.filter((u) => u.role === 'event-manager');

  const publicEvent = useMemo(() => {
    if (!publicSlug) return null;
    return events.find((item) => item.slug === publicSlug) ?? null;
  }, [events, publicSlug]);

  const publicParticipants = useMemo(() => {
    if (!publicEvent) return [];
    return participants.filter((p) => p.eventId === publicEvent.id);
  }, [participants, publicEvent]);

  const publicMetrics = useMemo(() => {
    const totalRegistered = publicParticipants.length;
    const totalTrained = publicParticipants.filter((p) => Boolean(p.trainedAt)).length;
    const trackCompleted = publicParticipants.filter((p) => Boolean(p.trackExitedAt)).length;
    const nextInLine = publicParticipants.filter((p) => p.gearAllocatedAt && !p.trackEnteredAt).slice(0, 5);
    return { totalRegistered, totalTrained, trackCompleted, nextInLine };
  }, [publicParticipants]);

  const login = async () => {
    if (!authEmail.trim() || !authPassword.trim()) return;
    try {
      setAuthError('');
      await signInWithEmailAndPassword(auth, authEmail.trim(), authPassword);
      setTab('console');
    } catch {
      setAuthError('login failed. check email/password');
    }
  };

  const createAuthUser = async (email: string, password: string, role: AppRole) => {
    if (!currentUser) {
      setError('please login first');
      return false;
    }
    if (!email.trim() || !password.trim()) {
      setError('email and password are required');
      return false;
    }

    const token = await currentUser.getIdToken();
    const res = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password, role }),
    });

    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? 'could not create user');
      return false;
    }

    return true;
  };

  const createGlobalUser = async () => {
    setError('');
    const ok = await createAuthUser(newGlobalEmail, newGlobalPassword, newGlobalRole);
    if (!ok) return;
    setNotice('user created in auth + roles');
    setNewGlobalEmail('');
    setNewGlobalPassword('');
    setNewGlobalRole('reception');
  };

  const removeGlobalUser = async (id: string) => {
    if (!isAdmin) return;
    await deleteDoc(doc(db, 'users', id));
  };

  const createEvent = async () => {
    if (!canManageEvents || !currentEmail) return;
    setError('');
    const slug = toSlug(eventName);
    if (!eventName.trim() || !eventLocation.trim() || !eventDate.trim() || !eventManagerEmail.trim()) {
      setError('event name, location, date, and event manager are required');
      return;
    }

    await addDoc(collection(db, 'events'), {
      name: eventName.trim(),
      location: eventLocation.trim(),
      date: eventDate,
      slug,
      eventManagerEmail: eventManagerEmail.trim().toLowerCase(),
      createdBy: currentEmail,
      createdAt: Date.now(),
    });

    setNotice('event created');
    setEventName('');
    setEventLocation('');
    setEventDate('');
    setEventManagerEmail('');
  };

  const updateSelectedEvent = async () => {
    if (!selectedEvent || !currentEmail) return;
    const owner = selectedEvent.createdBy === currentEmail;
    if (!isAdmin && !(isRcm && owner)) {
      setError('you can only edit events created by you');
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

  const loadSelectedEvent = () => {
    if (!selectedEvent) return;
    setEventName(selectedEvent.name);
    setEventLocation(selectedEvent.location);
    setEventDate(selectedEvent.date);
    setEventManagerEmail(selectedEvent.eventManagerEmail);
  };

  const assignUserToEvent = async () => {
    if (!canAssignTeam || !assignEventId) return;
    setError('');
    let userEmail = assignEmail.trim().toLowerCase();

    if (!userEmail || !assignRole) {
      setError('event, email, role required');
      return;
    }

    if (assignPassword.trim()) {
      const ok = await createAuthUser(userEmail, assignPassword, assignRole);
      if (!ok) return;
    }

    const id = `${assignEventId}__${emailKey(userEmail)}`;
    await setDoc(doc(db, 'eventUsers', id), {
      eventId: assignEventId,
      email: userEmail,
      role: assignRole,
      createdAt: Date.now(),
    });

    setNotice('user assigned to event');
    setAssignEmail('');
    setAssignPassword('');
    setAssignRole('reception');
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
      rows = snap.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<Participant, 'id'>) }));
    } else {
      const snap = await getDocs(collection(db, 'participants'));
      rows = snap.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<Participant, 'id'>) }));
    }

    const eventMap = new Map(events.map((event) => [event.id, event.name]));
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

  const visibleParticipants = participants;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 font-[family-name:var(--font-manrope)] text-slate-900 md:px-8">
      <div className="mx-auto max-w-5xl space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">track man</p>
          <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="font-[family-name:var(--font-space-grotesk)] text-4xl font-semibold">event operations</h1>
              <p className="text-sm text-slate-500">clean role-based flow for events</p>
            </div>
            <Tabs
              selectedKey={tab}
              onSelectionChange={(key) => setTab(key as 'public' | 'console')}
              variant="bordered"
              radius="full"
            >
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
                  public dashboard works only with event link: <span className="font-medium">{origin}/?event=event-slug</span>
                </CardBody>
              </Card>
            ) : !publicEvent ? (
              <Card className="border border-rose-200 bg-rose-50">
                <CardBody className="text-sm text-rose-700">event not found for this link</CardBody>
              </Card>
            ) : (
              <>
                <Card className="border border-slate-200 bg-white">
                  <CardHeader>
                    <div>
                      <h2 className="text-2xl font-semibold">{publicEvent.name}</h2>
                      <p className="text-sm text-slate-500">
                        {publicEvent.location} - {publicEvent.date}
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
                    <h3 className="text-lg font-semibold">next 5 in line</h3>
                  </CardHeader>
                  <Divider />
                  <CardBody className="space-y-2">
                    {publicMetrics.nextInLine.length === 0 ? (
                      <p className="text-sm text-slate-500">no one in line yet</p>
                    ) : (
                      publicMetrics.nextInLine.map((item) => (
                        <div key={item.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                          <p className="font-medium">{item.name}</p>
                          <Chip variant="flat">{item.bikeOwned}</Chip>
                        </div>
                      ))
                    )}
                  </CardBody>
                </Card>
              </>
            )}
          </section>
        ) : (
          <section className="space-y-4">
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
              <>
                <Card className="border border-slate-200 bg-white">
                  <CardHeader className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-semibold">console</h2>
                      <p className="text-sm text-slate-500">{currentUser.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {effectiveRoles.length === 0 ? (
                        <Chip variant="flat" color="warning">
                          no roles assigned
                        </Chip>
                      ) : (
                        effectiveRoles.map((role) => (
                          <Chip key={role} variant="flat" color="primary">
                            {roleLabel(role)}
                          </Chip>
                        ))
                      )}
                      <Button variant="flat" onPress={() => signOut(auth)}>
                        Sign Out
                      </Button>
                    </div>
                  </CardHeader>
                </Card>

                <Card className="border border-slate-200 bg-white">
                  <CardHeader>
                    <h3 className="text-lg font-semibold">selected event</h3>
                  </CardHeader>
                  <CardBody className="space-y-2">
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
                    {selectedEvent ? (
                      <p className="text-sm text-slate-500">public link: {origin}/?event={selectedEvent.slug}</p>
                    ) : null}
                  </CardBody>
                </Card>

                {isAdmin ? (
                  <Card className="border border-slate-200 bg-white">
                    <CardHeader>
                      <h3 className="text-lg font-semibold">create user (auth + role)</h3>
                    </CardHeader>
                    <CardBody className="grid gap-3 md:grid-cols-4">
                      <Input label="email" value={newGlobalEmail} onValueChange={setNewGlobalEmail} />
                      <Input label="password" type="password" value={newGlobalPassword} onValueChange={setNewGlobalPassword} />
                      <Select
                        label="role"
                        selectedKeys={[newGlobalRole]}
                        onSelectionChange={(keys) => {
                          const first = Array.from(keys)[0];
                          if (typeof first === 'string') setNewGlobalRole(first as AppRole);
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

                    <CardBody className="pt-0">
                      <div className="space-y-2">
                        {users.map((item) => (
                          <div key={item.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                            <div>
                              <p className="font-medium">{item.email}</p>
                              <p className="text-xs text-slate-500">{roleLabel(item.role)}</p>
                            </div>
                            <Button size="sm" color="danger" variant="flat" onPress={() => removeGlobalUser(item.id)}>
                              Remove Role
                            </Button>
                          </div>
                        ))}
                      </div>
                    </CardBody>
                  </Card>
                ) : null}

                {canManageEvents ? (
                  <Card className="border border-slate-200 bg-white">
                    <CardHeader>
                      <h3 className="text-lg font-semibold">create / update event</h3>
                    </CardHeader>
                    <CardBody className="grid gap-3 md:grid-cols-4">
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
                    </CardBody>
                    <CardBody className="pt-0">
                      <div className="flex flex-wrap gap-2">
                        <Button color="primary" onPress={createEvent}>
                          Create Event
                        </Button>
                        <Button variant="flat" onPress={loadSelectedEvent}>
                          Load Selected
                        </Button>
                        <Button variant="flat" color="warning" onPress={updateSelectedEvent}>
                          Update Selected
                        </Button>
                      </div>
                    </CardBody>
                  </Card>
                ) : null}

                {canAssignTeam ? (
                  <Card className="border border-slate-200 bg-white">
                    <CardHeader>
                      <h3 className="text-lg font-semibold">assign event team</h3>
                    </CardHeader>
                    <CardBody className="grid gap-3 md:grid-cols-5">
                      <Select
                        label="event"
                        selectedKeys={assignEventId ? [assignEventId] : []}
                        onSelectionChange={(keys) => {
                          const first = Array.from(keys)[0];
                          if (typeof first === 'string') setAssignEventId(first);
                        }}
                      >
                        {events.map((event) => (
                          <SelectItem key={event.id}>{event.name}</SelectItem>
                        ))}
                      </Select>
                      <Input label="user email" value={assignEmail} onValueChange={setAssignEmail} />
                      <Input
                        label="password (optional new user)"
                        type="password"
                        value={assignPassword}
                        onValueChange={setAssignPassword}
                      />
                      <Select
                        label="role"
                        selectedKeys={[assignRole]}
                        onSelectionChange={(keys) => {
                          const first = Array.from(keys)[0];
                          if (typeof first === 'string') setAssignRole(first as AppRole);
                        }}
                      >
                        {teamAssignableRoles.map((role) => (
                          <SelectItem key={role}>{roleLabel(role)}</SelectItem>
                        ))}
                      </Select>
                      <Button className="md:mt-6" color="primary" onPress={assignUserToEvent}>
                        Assign
                      </Button>
                    </CardBody>
                  </Card>
                ) : null}

                <Card className="border border-slate-200 bg-white">
                  <CardHeader>
                    <h3 className="text-lg font-semibold">register participant</h3>
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
                  <CardHeader>
                    <h3 className="text-lg font-semibold">participant flow</h3>
                  </CardHeader>
                  <Divider />
                  <CardBody className="space-y-2">
                    {visibleParticipants.length === 0 ? (
                      <p className="text-sm text-slate-500">no participants in selected event</p>
                    ) : (
                      visibleParticipants.map((item) => (
                        <div key={item.id} className="space-y-2 rounded-lg border border-slate-200 p-3 md:flex md:items-center md:justify-between md:space-y-0">
                          <div>
                            <p className="font-medium">{item.name}</p>
                            <p className="text-xs text-slate-500">
                              {item.contactNumber} - {item.email} - bike: {item.bikeOwned}
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

                {isAdmin ? (
                  <Card className="border border-slate-200 bg-white">
                    <CardHeader>
                      <h3 className="text-lg font-semibold">download excel-ready csv</h3>
                    </CardHeader>
                    <CardBody className="flex flex-wrap gap-2">
                      <Button color="success" onPress={() => exportCsv('event')}>
                        event wise csv
                      </Button>
                      <Button variant="flat" onPress={() => exportCsv('total')}>
                        total csv
                      </Button>
                    </CardBody>
                  </Card>
                ) : null}
              </>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
