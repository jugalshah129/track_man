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
  Textarea,
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
  slug: string;
  createdBy: string;
  plannerEmail: string;
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
  bikeNumber: string;
  createdAt: number;
  trainedAt?: number;
  gearAllocatedAt?: number;
  trackEnteredAt?: number;
  trackExitedAt?: number;
  gearReturnedAt?: number;
  gearItems?: {
    gloves: boolean;
    jacket: boolean;
    helmet: boolean;
    kneeGuard: boolean;
  };
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

function emailKey(email: string): string {
  return email.trim().toLowerCase().replaceAll('.', ',');
}

function roleLabel(role: AppRole): string {
  const item = roleOptions.find((r) => r.key === role);
  return item?.label ?? role;
}

function toSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function participantStage(p: Participant): string {
  if (p.gearReturnedAt) return 'returned-gears';
  if (p.trackExitedAt) return 'exited-track';
  if (p.trackEnteredAt) return 'on-track';
  if (p.gearAllocatedAt) return 'gear-allocated';
  if (p.trainedAt) return 'trained';
  return 'registered';
}

function stageLabel(stage: string): string {
  if (stage === 'registered') return 'Registered';
  if (stage === 'trained') return 'Trained';
  if (stage === 'gear-allocated') return 'Gears Allocated';
  if (stage === 'on-track') return 'On Track';
  if (stage === 'exited-track') return 'Exited Track';
  return 'Returned Gears';
}

function csvEscape(value: string | number): string {
  const text = String(value);
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

export default function TrackManPage() {
  const [activeView, setActiveView] = useState<'public' | 'console'>('public');
  const [origin, setOrigin] = useState('');

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [globalRole, setGlobalRole] = useState<AppRole | null>(null);

  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [dataError, setDataError] = useState('');

  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedEventId, setSelectedEventId] = useState('');

  const [eventName, setEventName] = useState('');
  const [eventSlug, setEventSlug] = useState('');
  const [eventPlannerEmail, setEventPlannerEmail] = useState('');

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [participantName, setParticipantName] = useState('');
  const [bikeNumber, setBikeNumber] = useState('');

  const [userList, setUserList] = useState<RoleUser[]>([]);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<AppRole>('reception');

  const [eventUsers, setEventUsers] = useState<EventUser[]>([]);
  const [assignEmail, setAssignEmail] = useState('');
  const [assignRole, setAssignRole] = useState<AppRole>('reception');

  const [publicEventSlug, setPublicEventSlug] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
    const params = new URLSearchParams(window.location.search);
    setPublicEventSlug(params.get('event')?.toLowerCase() ?? '');
  }, []);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (!user?.email) {
        setGlobalRole(null);
        return;
      }

      const profileRef = doc(db, 'users', emailKey(user.email));
      return onSnapshot(profileRef, (profileSnap) => {
        if (!profileSnap.exists()) {
          setGlobalRole(null);
          return;
        }
        const profileData = profileSnap.data() as { role?: AppRole };
        setGlobalRole(profileData.role ?? null);
      });
    });

    return () => unsubAuth();
  }, []);

  useEffect(() => {
    const eventsQuery = query(collection(db, 'events'), orderBy('createdAt', 'asc'));
    const unsubEvents = onSnapshot(
      eventsQuery,
      (snap) => {
        const rows: EventItem[] = snap.docs.map((item) => {
          const data = item.data() as Omit<EventItem, 'id'>;
          return {
            id: item.id,
            name: data.name,
            slug: data.slug,
            createdBy: data.createdBy,
            plannerEmail: data.plannerEmail ?? '',
            createdAt: Number(data.createdAt ?? Date.now()),
          };
        });
        setEvents(rows);
        if (!selectedEventId && rows.length > 0) {
          setSelectedEventId(rows[0].id);
        }
      },
      () => setDataError('unable to load events from database')
    );

    return () => unsubEvents();
  }, [selectedEventId]);

  useEffect(() => {
    if (!selectedEventId) {
      setParticipants([]);
      return;
    }

    const participantQuery = query(collection(db, 'participants'), where('eventId', '==', selectedEventId));
    const unsub = onSnapshot(
      participantQuery,
      (snap) => {
        const rows: Participant[] = snap.docs
          .map((item) => {
            const data = item.data() as Omit<Participant, 'id'>;
            return {
              id: item.id,
              eventId: data.eventId,
              name: data.name,
              bikeNumber: data.bikeNumber,
              createdAt: Number(data.createdAt ?? Date.now()),
              trainedAt: data.trainedAt,
              gearAllocatedAt: data.gearAllocatedAt,
              trackEnteredAt: data.trackEnteredAt,
              trackExitedAt: data.trackExitedAt,
              gearReturnedAt: data.gearReturnedAt,
              gearItems: data.gearItems,
            };
          })
          .sort((a, b) => a.createdAt - b.createdAt);

        setParticipants(rows);
      },
      () => setDataError('unable to load participants from database')
    );

    return () => unsub();
  }, [selectedEventId]);

  useEffect(() => {
    const usersQuery = query(collection(db, 'users'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(usersQuery, (snap) => {
      const rows: RoleUser[] = snap.docs.map((item) => {
        const data = item.data() as Omit<RoleUser, 'id'>;
        return {
          id: item.id,
          email: data.email,
          role: data.role,
          createdAt: Number(data.createdAt ?? Date.now()),
        };
      });
      setUserList(rows);
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (!selectedEventId) {
      setEventUsers([]);
      return;
    }

    const assignQuery = query(collection(db, 'eventUsers'), where('eventId', '==', selectedEventId));
    const unsub = onSnapshot(assignQuery, (snap) => {
      const rows: EventUser[] = snap.docs.map((item) => {
        const data = item.data() as Omit<EventUser, 'id'>;
        return {
          id: item.id,
          eventId: data.eventId,
          email: data.email,
          role: data.role,
          createdAt: Number(data.createdAt ?? Date.now()),
        };
      });
      setEventUsers(rows.sort((a, b) => a.createdAt - b.createdAt));
    });

    return () => unsub();
  }, [selectedEventId]);

  useEffect(() => {
    if (!publicEventSlug || events.length === 0) return;
    const eventFromSlug = events.find((event) => event.slug === publicEventSlug);
    if (eventFromSlug) {
      setSelectedEventId(eventFromSlug.id);
    }
  }, [events, publicEventSlug]);

  const selectedEvent = useMemo(() => events.find((event) => event.id === selectedEventId) ?? null, [events, selectedEventId]);

  const myEventRoles = useMemo(() => {
    if (!currentUser?.email || !selectedEventId) return [] as AppRole[];
    return eventUsers.filter((item) => item.email === currentUser.email?.toLowerCase()).map((item) => item.role);
  }, [currentUser?.email, eventUsers, selectedEventId]);

  const effectiveRoles = useMemo(() => {
    const roles = new Set<AppRole>();
    if (globalRole) roles.add(globalRole);
    myEventRoles.forEach((r) => roles.add(r));
    return Array.from(roles);
  }, [globalRole, myEventRoles]);

  const hasRole = (role: AppRole) => effectiveRoles.includes(role);
  const isAdmin = hasRole('admin');
  const isRcm = hasRole('rcm');
  const isEventManager = hasRole('event-manager');
  const canManageEvents = isAdmin || isRcm;
  const canManageAssignments = isAdmin || isEventManager;
  const canReception = isAdmin || hasRole('reception');
  const canTrainer = isAdmin || hasRole('trainer');
  const canGear = isAdmin || hasRole('gear-manager');
  const canTrack = isAdmin || hasRole('track-manager');

  const counts = useMemo(() => {
    let registered = 0;
    let trained = 0;
    let gearAllocated = 0;
    let onTrack = 0;
    let exitedTrack = 0;
    let returnedGears = 0;

    participants.forEach((item) => {
      const stage = participantStage(item);
      if (stage === 'registered') registered += 1;
      if (stage === 'trained') trained += 1;
      if (stage === 'gear-allocated') gearAllocated += 1;
      if (stage === 'on-track') onTrack += 1;
      if (stage === 'exited-track') exitedTrack += 1;
      if (stage === 'returned-gears') returnedGears += 1;
    });

    return {
      total: participants.length,
      registered,
      trained,
      gearAllocated,
      onTrack,
      exitedTrack,
      returnedGears,
    };
  }, [participants]);

  const handleSignIn = async () => {
    if (!authEmail.trim() || !authPassword.trim()) {
      setAuthError('enter email and password');
      return;
    }

    try {
      setAuthLoading(true);
      setAuthError('');
      await signInWithEmailAndPassword(auth, authEmail.trim(), authPassword);
      setAuthPassword('');
      setActiveView('console');
    } catch {
      setAuthError('login failed. check your email/password.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  const resetEventFormFromSelected = () => {
    if (!selectedEvent) return;
    setEventName(selectedEvent.name);
    setEventSlug(selectedEvent.slug);
    setEventPlannerEmail(selectedEvent.plannerEmail ?? '');
  };

  const createEvent = async () => {
    if (!canManageEvents || !currentUser?.email) return;
    const nextName = eventName.trim();
    const nextSlug = toSlug(eventSlug || eventName);
    if (!nextName || !nextSlug) return;

    await addDoc(collection(db, 'events'), {
      name: nextName,
      slug: nextSlug,
      plannerEmail: eventPlannerEmail.trim().toLowerCase(),
      createdBy: currentUser.email.toLowerCase(),
      createdAt: Date.now(),
    });

    setEventName('');
    setEventSlug('');
    setEventPlannerEmail('');
  };

  const updateEventDetails = async () => {
    if (!selectedEvent || !currentUser?.email) return;

    const owner = selectedEvent.createdBy === currentUser.email.toLowerCase();
    if (!isAdmin && !(isRcm && owner)) return;

    await updateDoc(doc(db, 'events', selectedEvent.id), {
      name: eventName.trim() || selectedEvent.name,
      slug: toSlug(eventSlug || selectedEvent.slug),
      plannerEmail: eventPlannerEmail.trim().toLowerCase(),
    });
  };

  const deleteEvent = async () => {
    if (!selectedEvent || !currentUser?.email) return;

    const owner = selectedEvent.createdBy === currentUser.email.toLowerCase();
    if (!isAdmin && !(isRcm && owner)) return;

    await deleteDoc(doc(db, 'events', selectedEvent.id));
    setSelectedEventId('');
  };

  const registerParticipant = async () => {
    if (!selectedEventId || !canReception) return;
    if (!participantName.trim() || !bikeNumber.trim()) return;

    await addDoc(collection(db, 'participants'), {
      eventId: selectedEventId,
      name: participantName.trim(),
      bikeNumber: bikeNumber.trim(),
      createdAt: Date.now(),
    });

    setParticipantName('');
    setBikeNumber('');
  };

  const markTrained = async (id: string) => {
    if (!canTrainer) return;
    await updateDoc(doc(db, 'participants', id), { trainedAt: Date.now() });
  };

  const allocateGears = async (id: string) => {
    if (!canGear) return;
    await updateDoc(doc(db, 'participants', id), {
      gearAllocatedAt: Date.now(),
      gearItems: {
        gloves: true,
        jacket: true,
        helmet: true,
        kneeGuard: true,
      },
    });
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

  const saveGlobalUser = async () => {
    if (!isAdmin) return;
    if (!newUserEmail.trim()) return;

    await setDoc(doc(db, 'users', emailKey(newUserEmail)), {
      email: newUserEmail.trim().toLowerCase(),
      role: newUserRole,
      createdAt: Date.now(),
    });

    setNewUserEmail('');
    setNewUserRole('reception');
  };

  const removeGlobalUser = async (id: string) => {
    if (!isAdmin) return;
    await deleteDoc(doc(db, 'users', id));
  };

  const saveEventAssignment = async () => {
    if (!canManageAssignments || !selectedEventId) return;
    if (!assignEmail.trim()) return;

    const id = `${selectedEventId}__${emailKey(assignEmail)}`;
    await setDoc(doc(db, 'eventUsers', id), {
      eventId: selectedEventId,
      email: assignEmail.trim().toLowerCase(),
      role: assignRole,
      createdAt: Date.now(),
    });

    setAssignEmail('');
    setAssignRole('reception');
  };

  const removeEventAssignment = async (id: string) => {
    if (!canManageAssignments) return;
    await deleteDoc(doc(db, 'eventUsers', id));
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
      'bike_number',
      'stage',
      'registered_at',
      'trained_at',
      'gear_allocated_at',
      'track_entered_at',
      'track_exited_at',
      'gear_returned_at',
    ];

    const lines = rows
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
      .map((item) => {
        const stage = participantStage(item);
        return [
          csvEscape(eventMap.get(item.eventId) ?? item.eventId),
          csvEscape(item.name ?? ''),
          csvEscape(item.bikeNumber ?? ''),
          csvEscape(stageLabel(stage)),
          csvEscape(item.createdAt ?? ''),
          csvEscape(item.trainedAt ?? ''),
          csvEscape(item.gearAllocatedAt ?? ''),
          csvEscape(item.trackEnteredAt ?? ''),
          csvEscape(item.trackExitedAt ?? ''),
          csvEscape(item.gearReturnedAt ?? ''),
        ].join(',');
      });

    const csvText = `${header.join(',')}\n${lines.join('\n')}`;
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = scope === 'event' ? `event-${selectedEvent?.slug ?? 'data'}.csv` : 'all-events.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const publicEvent = useMemo(() => {
    if (!publicEventSlug) return null;
    return events.find((event) => event.slug === publicEventSlug) ?? null;
  }, [events, publicEventSlug]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#f4f9ff_0%,_#ecf4ff_40%,_#e6f0ff_70%,_#dce9ff_100%)] px-4 py-8 font-[family-name:var(--font-manrope)] text-slate-800 md:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-3xl border border-sky-100 bg-white/80 p-6 shadow-lg shadow-sky-100/80 backdrop-blur-md md:p-8">
          <p className="text-xs uppercase tracking-[0.2em] text-sky-700">event control center</p>
          <div className="mt-2 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="font-[family-name:var(--font-space-grotesk)] text-4xl font-bold text-slate-900 md:text-5xl">
                Track Man
              </h1>
              <p className="mt-2 text-slate-600">event-based participant flow</p>
            </div>
            <div className="flex gap-2">
              <Button
                radius="full"
                color={activeView === 'public' ? 'primary' : 'default'}
                variant={activeView === 'public' ? 'solid' : 'bordered'}
                onPress={() => setActiveView('public')}
              >
                Public
              </Button>
              <Button
                radius="full"
                color={activeView === 'console' ? 'primary' : 'default'}
                variant={activeView === 'console' ? 'solid' : 'bordered'}
                onPress={() => setActiveView('console')}
              >
                Console
              </Button>
            </div>
          </div>
        </section>

        {dataError ? (
          <Card className="border border-rose-200 bg-rose-50/80">
            <CardBody>
              <p className="text-rose-700">{dataError}</p>
            </CardBody>
          </Card>
        ) : null}

        {activeView === 'public' ? (
          <section className="space-y-4">
            {!publicEventSlug ? (
              <Card className="border border-amber-200 bg-amber-50/80">
                <CardBody>
                  <p className="text-amber-800">
                    no standard public dashboard. open a custom event link like <span className="font-semibold">{origin}/?event=event-slug</span>.
                  </p>
                </CardBody>
              </Card>
            ) : !publicEvent ? (
              <Card className="border border-rose-200 bg-rose-50/80">
                <CardBody>
                  <p className="text-rose-700">this event link is invalid or event is not created yet.</p>
                </CardBody>
              </Card>
            ) : (
              <>
                <Card className="border border-sky-100 bg-white/90">
                  <CardHeader>
                    <div>
                      <h2 className="text-2xl font-semibold text-slate-900">{publicEvent.name}</h2>
                      <p className="text-sm text-slate-600">live status board</p>
                    </div>
                  </CardHeader>
                </Card>

                <div className="grid gap-4 md:grid-cols-3">
                  <Card className="border border-sky-100 bg-white/90">
                    <CardHeader className="pb-0 text-sm text-slate-500">Total</CardHeader>
                    <CardBody>
                      <p className="text-4xl font-bold text-slate-900">{counts.total}</p>
                    </CardBody>
                  </Card>
                  <Card className="border border-amber-100 bg-white/90">
                    <CardHeader className="pb-0 text-sm text-slate-500">Registered</CardHeader>
                    <CardBody>
                      <p className="text-4xl font-bold text-amber-700">{counts.registered}</p>
                    </CardBody>
                  </Card>
                  <Card className="border border-indigo-100 bg-white/90">
                    <CardHeader className="pb-0 text-sm text-slate-500">Returned Gears</CardHeader>
                    <CardBody>
                      <p className="text-4xl font-bold text-indigo-700">{counts.returnedGears}</p>
                    </CardBody>
                  </Card>
                </div>

                <Card className="border border-sky-100 bg-white/90">
                  <CardHeader>
                    <h3 className="text-xl font-semibold text-slate-900">Latest Participants</h3>
                  </CardHeader>
                  <Divider />
                  <CardBody className="space-y-2">
                    {participants.length === 0 ? (
                      <p className="text-slate-500">no participants yet</p>
                    ) : (
                      participants.slice(-10).reverse().map((item) => {
                        const stage = participantStage(item);
                        return (
                          <div
                            key={item.id}
                            className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"
                          >
                            <div>
                              <p className="font-medium text-slate-900">{item.name}</p>
                              <p className="text-xs text-slate-500">bike #{item.bikeNumber}</p>
                            </div>
                            <Chip variant="flat">{stageLabel(stage)}</Chip>
                          </div>
                        );
                      })
                    )}
                  </CardBody>
                </Card>
              </>
            )}
          </section>
        ) : (
          <section className="space-y-4">
            {!currentUser ? (
              <Card className="mx-auto w-full max-w-md border border-sky-100 bg-white/90">
                <CardHeader>
                  <h2 className="text-2xl font-semibold text-slate-900">Login</h2>
                </CardHeader>
                <CardBody className="space-y-4">
                  <Input label="email" type="email" value={authEmail} onValueChange={setAuthEmail} />
                  <Input label="password" type="password" value={authPassword} onValueChange={setAuthPassword} />
                  {authError ? <p className="text-sm text-rose-600">{authError}</p> : null}
                  <Button color="primary" isLoading={authLoading} onPress={handleSignIn}>
                    Sign In
                  </Button>
                </CardBody>
              </Card>
            ) : (
              <>
                <Card className="border border-sky-100 bg-white/90">
                  <CardHeader className="flex items-center justify-between">
                    <div>
                      <h2 className="text-2xl font-semibold text-slate-900">Console</h2>
                      <p className="text-sm text-slate-600">{currentUser.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {effectiveRoles.length === 0 ? (
                        <Chip color="warning" variant="flat">
                          no role assigned
                        </Chip>
                      ) : (
                        effectiveRoles.map((role) => (
                          <Chip key={role} color="primary" variant="flat">
                            {roleLabel(role)}
                          </Chip>
                        ))
                      )}
                      <Button size="sm" variant="flat" onPress={handleSignOut}>
                        Sign Out
                      </Button>
                    </div>
                  </CardHeader>
                </Card>

                <Card className="border border-sky-100 bg-white/90">
                  <CardHeader>
                    <h3 className="text-xl font-semibold text-slate-900">Select Event</h3>
                  </CardHeader>
                  <Divider />
                  <CardBody className="space-y-3">
                    <Select
                      label="event"
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
                    {selectedEvent ? (
                      <p className="text-sm text-slate-600">
                        public link: <span className="font-medium">{origin}/?event={selectedEvent.slug}</span>
                      </p>
                    ) : null}
                  </CardBody>
                </Card>

                {canManageEvents ? (
                  <Card className="border border-cyan-100 bg-white/90">
                    <CardHeader>
                      <h3 className="text-xl font-semibold text-slate-900">Event Setup (Admin/RCM)</h3>
                    </CardHeader>
                    <Divider />
                    <CardBody className="space-y-3">
                      <div className="grid gap-3 md:grid-cols-3">
                        <Input label="event name" value={eventName} onValueChange={setEventName} />
                        <Input label="event slug" value={eventSlug} onValueChange={setEventSlug} />
                        <Input label="event manager email" value={eventPlannerEmail} onValueChange={setEventPlannerEmail} />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button color="primary" onPress={createEvent}>
                          Create Event
                        </Button>
                        <Button variant="flat" onPress={resetEventFormFromSelected}>
                          Load Selected
                        </Button>
                        <Button color="warning" variant="flat" onPress={updateEventDetails}>
                          Update Selected
                        </Button>
                        <Button color="danger" variant="flat" onPress={deleteEvent}>
                          Delete Selected
                        </Button>
                      </div>
                    </CardBody>
                  </Card>
                ) : null}

                {isAdmin ? (
                  <Card className="border border-cyan-100 bg-white/90">
                    <CardHeader>
                      <h3 className="text-xl font-semibold text-slate-900">Global Users (Admin)</h3>
                    </CardHeader>
                    <Divider />
                    <CardBody className="space-y-3">
                      <div className="grid gap-3 md:grid-cols-3">
                        <Input label="user email" value={newUserEmail} onValueChange={setNewUserEmail} />
                        <Select
                          label="global role"
                          selectedKeys={[newUserRole]}
                          onSelectionChange={(keys) => {
                            const first = Array.from(keys)[0];
                            if (typeof first === 'string') {
                              setNewUserRole(first as AppRole);
                            }
                          }}
                        >
                          {roleOptions.map((option) => (
                            <SelectItem key={option.key}>{option.label}</SelectItem>
                          ))}
                        </Select>
                        <Button className="md:mt-6" color="primary" onPress={saveGlobalUser}>
                          Add Or Update User
                        </Button>
                      </div>

                      <div className="space-y-2">
                        {userList.length === 0 ? (
                          <p className="text-slate-500">no users yet</p>
                        ) : (
                          userList.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"
                            >
                              <div>
                                <p className="font-medium text-slate-900">{item.email}</p>
                                <p className="text-xs text-slate-500">{roleLabel(item.role)}</p>
                              </div>
                              <Button size="sm" color="danger" variant="flat" onPress={() => removeGlobalUser(item.id)}>
                                Remove
                              </Button>
                            </div>
                          ))
                        )}
                      </div>
                    </CardBody>
                  </Card>
                ) : null}

                {canManageAssignments && selectedEvent ? (
                  <Card className="border border-blue-100 bg-white/90">
                    <CardHeader>
                      <h3 className="text-xl font-semibold text-slate-900">Event Team Assignment</h3>
                    </CardHeader>
                    <Divider />
                    <CardBody className="space-y-3">
                      <div className="grid gap-3 md:grid-cols-3">
                        <Input label="email" value={assignEmail} onValueChange={setAssignEmail} />
                        <Select
                          label="role"
                          selectedKeys={[assignRole]}
                          onSelectionChange={(keys) => {
                            const first = Array.from(keys)[0];
                            if (typeof first === 'string') {
                              setAssignRole(first as AppRole);
                            }
                          }}
                        >
                          {roleOptions
                            .filter((item) => item.key !== 'admin' && item.key !== 'rcm')
                            .map((option) => (
                              <SelectItem key={option.key}>{option.label}</SelectItem>
                            ))}
                        </Select>
                        <Button className="md:mt-6" color="primary" onPress={saveEventAssignment}>
                          Assign To Event
                        </Button>
                      </div>

                      <div className="space-y-2">
                        {eventUsers.length === 0 ? (
                          <p className="text-slate-500">no one assigned to this event yet</p>
                        ) : (
                          eventUsers.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"
                            >
                              <div>
                                <p className="font-medium text-slate-900">{item.email}</p>
                                <p className="text-xs text-slate-500">{roleLabel(item.role)}</p>
                              </div>
                              <Button size="sm" color="danger" variant="flat" onPress={() => removeEventAssignment(item.id)}>
                                Remove
                              </Button>
                            </div>
                          ))
                        )}
                      </div>
                    </CardBody>
                  </Card>
                ) : null}

                <Card className="border border-sky-100 bg-white/90">
                  <CardHeader>
                    <h3 className="text-xl font-semibold text-slate-900">Participant Pipeline</h3>
                  </CardHeader>
                  <Divider />
                  <CardBody className="space-y-4">
                    {canReception ? (
                      <div className="grid gap-3 md:grid-cols-3">
                        <Input label="participant name" value={participantName} onValueChange={setParticipantName} />
                        <Input label="bike number" value={bikeNumber} onValueChange={setBikeNumber} />
                        <Button className="md:mt-6" color="primary" onPress={registerParticipant}>
                          Register Participant
                        </Button>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">you can view participants, but registration needs reception/admin role.</p>
                    )}

                    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                      <Chip variant="flat">Total: {counts.total}</Chip>
                      <Chip variant="flat">Registered: {counts.registered}</Chip>
                      <Chip variant="flat">Trained: {counts.trained}</Chip>
                      <Chip variant="flat">Gear: {counts.gearAllocated}</Chip>
                      <Chip variant="flat">On Track: {counts.onTrack}</Chip>
                      <Chip variant="flat">Returned: {counts.returnedGears}</Chip>
                    </div>

                    <div className="space-y-2">
                      {participants.length === 0 ? (
                        <p className="text-slate-500">no participants in this event yet</p>
                      ) : (
                        participants.map((item) => {
                          const stage = participantStage(item);
                          return (
                            <div
                              key={item.id}
                              className="space-y-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 md:flex md:items-center md:justify-between md:space-y-0"
                            >
                              <div>
                                <p className="font-medium text-slate-900">{item.name}</p>
                                <p className="text-xs text-slate-500">bike #{item.bikeNumber}</p>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <Chip variant="flat">{stageLabel(stage)}</Chip>
                                {canTrainer && !item.trainedAt ? (
                                  <Button size="sm" variant="flat" color="secondary" onPress={() => markTrained(item.id)}>
                                    Mark Trained
                                  </Button>
                                ) : null}
                                {canGear && item.trainedAt && !item.gearAllocatedAt ? (
                                  <Button size="sm" variant="flat" color="warning" onPress={() => allocateGears(item.id)}>
                                    Allocate Gears
                                  </Button>
                                ) : null}
                                {canTrack && item.gearAllocatedAt && !item.trackEnteredAt ? (
                                  <Button size="sm" variant="flat" color="primary" onPress={() => markTrackEntry(item.id)}>
                                    Enter Track
                                  </Button>
                                ) : null}
                                {canTrack && item.trackEnteredAt && !item.trackExitedAt ? (
                                  <Button size="sm" variant="flat" color="primary" onPress={() => markTrackExit(item.id)}>
                                    Exit Track
                                  </Button>
                                ) : null}
                                {canGear && item.trackExitedAt && !item.gearReturnedAt ? (
                                  <Button size="sm" variant="flat" color="success" onPress={() => markGearReturn(item.id)}>
                                    Return Gears
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </CardBody>
                </Card>

                {isAdmin ? (
                  <Card className="border border-emerald-100 bg-white/90">
                    <CardHeader>
                      <h3 className="text-xl font-semibold text-slate-900">Export (Admin)</h3>
                    </CardHeader>
                    <Divider />
                    <CardBody className="space-y-3">
                      <p className="text-sm text-slate-600">download csv and open in excel for event-wise or total report.</p>
                      <div className="flex flex-wrap gap-2">
                        <Button color="success" onPress={() => exportCsv('event')}>
                          Download Selected Event CSV
                        </Button>
                        <Button variant="flat" onPress={() => exportCsv('total')}>
                          Download Total CSV
                        </Button>
                      </div>
                    </CardBody>
                  </Card>
                ) : null}

                <Card className="border border-slate-200 bg-white/80">
                  <CardHeader>
                    <h3 className="text-lg font-semibold text-slate-900">what changed in this version</h3>
                  </CardHeader>
                  <CardBody>
                    <Textarea
                      isReadOnly
                      minRows={5}
                      value={[
                        '- no self-signup on login page',
                        '- event-specific public dashboard link: /?event=slug',
                        '- roles: admin, rcm, event manager, reception, trainer, gear manager, track manager',
                        '- admin user management + event team assignments',
                        '- participant flow: register -> train -> allocate gear -> track in -> track out -> return gear',
                        '- admin csv export: event-wise + total',
                      ].join('\n')}
                    />
                  </CardBody>
                </Card>
              </>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
