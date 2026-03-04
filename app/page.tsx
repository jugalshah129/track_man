'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Card, CardBody, CardHeader, Chip, Divider, Input } from '@heroui/react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { addDoc, collection, doc, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

type RiderStatus = 'registered' | 'on-track' | 'returned';

type Rider = {
  id: string;
  name: string;
  bikeNumber: string;
  createdAt: number;
  status: RiderStatus;
};

export default function TrackManPage() {
  const [activeView, setActiveView] = useState<'public' | 'admin'>('public');
  const [adminUser, setAdminUser] = useState<User | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [riders, setRiders] = useState<Rider[]>([]);
  const [dataError, setDataError] = useState('');
  const [dataLoading, setDataLoading] = useState(true);

  const [riderName, setRiderName] = useState('');
  const [bikeNumber, setBikeNumber] = useState('');

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setAdminUser(user);
    });

    const ridersQuery = query(collection(db, 'riders'), orderBy('createdAt', 'asc'));
    const unsubRiders = onSnapshot(
      ridersQuery,
      (snapshot) => {
        const nextRiders: Rider[] = snapshot.docs.map((item) => {
          const data = item.data() as Omit<Rider, 'id'>;
          return {
            id: item.id,
            name: data.name,
            bikeNumber: data.bikeNumber,
            createdAt: Number(data.createdAt ?? Date.now()),
            status: data.status,
          };
        });
        setRiders(nextRiders);
        setDataError('');
        setDataLoading(false);
      },
      () => {
        setDataError('database is locked by rules right now. we will fix rules next.');
        setDataLoading(false);
      }
    );

    return () => {
      unsubAuth();
      unsubRiders();
    };
  }, []);

  const metrics = useMemo(() => {
    const totalRegistered = riders.length;
    const totalOnTrack = riders.filter((r) => r.status === 'on-track').length;
    const totalReturned = riders.filter((r) => r.status === 'returned').length;
    const nextFive = riders.filter((r) => r.status === 'registered').slice(0, 5);
    return { totalRegistered, totalOnTrack, totalReturned, nextFive };
  }, [riders]);

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
    } catch {
      setAuthError('login failed. check your email/password.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleCreateAccount = async () => {
    if (!authEmail.trim() || !authPassword.trim()) {
      setAuthError('enter email and password');
      return;
    }

    try {
      setAuthLoading(true);
      setAuthError('');
      await createUserWithEmailAndPassword(auth, authEmail.trim(), authPassword);
      setAuthPassword('');
    } catch {
      setAuthError('could not create account. try a stronger password.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  const registerRider = async () => {
    if (!adminUser) {
      setAuthError('login first to add riders');
      return;
    }
    if (!riderName.trim() || !bikeNumber.trim()) return;

    await addDoc(collection(db, 'riders'), {
      name: riderName.trim(),
      bikeNumber: bikeNumber.trim(),
      createdAt: Date.now(),
      status: 'registered' as RiderStatus,
    });

    setRiderName('');
    setBikeNumber('');
  };

  const moveToOnTrack = async (id: string) => {
    if (!adminUser) return;
    await updateDoc(doc(db, 'riders', id), { status: 'on-track' as RiderStatus });
  };

  const markReturned = async (id: string) => {
    if (!adminUser) return;
    await updateDoc(doc(db, 'riders', id), { status: 'returned' as RiderStatus });
  };

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
              <p className="mt-2 text-slate-600">registration and on-track flow for race day</p>
            </div>
            <div className="flex gap-2">
              <Button
                radius="full"
                color={activeView === 'public' ? 'primary' : 'default'}
                variant={activeView === 'public' ? 'solid' : 'bordered'}
                onPress={() => setActiveView('public')}
              >
                Public Dashboard
              </Button>
              <Button
                radius="full"
                color={activeView === 'admin' ? 'primary' : 'default'}
                variant={activeView === 'admin' ? 'solid' : 'bordered'}
                onPress={() => setActiveView('admin')}
              >
                Admin
              </Button>
            </div>
          </div>
        </section>

        {activeView === 'public' ? (
          <section className="space-y-5">
            {dataError ? (
              <Card className="border border-rose-200 bg-rose-50/80">
                <CardBody>
                  <p className="text-rose-700">{dataError}</p>
                </CardBody>
              </Card>
            ) : null}

            <div className="grid gap-4 md:grid-cols-3">
              <Card className="border border-sky-100 bg-white/90">
                <CardHeader className="pb-0 text-sm text-slate-500">Total Registration</CardHeader>
                <CardBody>
                  <p className="text-4xl font-bold text-slate-900">{metrics.totalRegistered}</p>
                </CardBody>
              </Card>
              <Card className="border border-emerald-100 bg-white/90">
                <CardHeader className="pb-0 text-sm text-slate-500">Total On Track</CardHeader>
                <CardBody>
                  <p className="text-4xl font-bold text-emerald-700">{metrics.totalOnTrack}</p>
                </CardBody>
              </Card>
              <Card className="border border-indigo-100 bg-white/90">
                <CardHeader className="pb-0 text-sm text-slate-500">Returned</CardHeader>
                <CardBody>
                  <p className="text-4xl font-bold text-indigo-700">{metrics.totalReturned}</p>
                </CardBody>
              </Card>
            </div>

            <Card className="border border-sky-100 bg-white/90">
              <CardHeader className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-slate-900">Next 5 Participants</h2>
                <Chip color="primary" variant="flat">
                  waiting queue
                </Chip>
              </CardHeader>
              <Divider />
              <CardBody className="space-y-2">
                {dataLoading ? (
                  <p className="text-slate-500">loading riders...</p>
                ) : metrics.nextFive.length === 0 ? (
                  <p className="text-slate-500">no one waiting yet</p>
                ) : (
                  metrics.nextFive.map((rider) => (
                    <div
                      key={rider.id}
                      className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"
                    >
                      <p className="font-medium text-slate-800">{rider.name}</p>
                      <Chip color="secondary" variant="flat">
                        bike #{rider.bikeNumber}
                      </Chip>
                    </div>
                  ))
                )}
              </CardBody>
            </Card>
          </section>
        ) : (
          <section>
            {!adminUser ? (
              <Card className="mx-auto w-full max-w-md border border-sky-100 bg-white/90">
                <CardHeader>
                  <h2 className="text-2xl font-semibold text-slate-900">Admin Login</h2>
                </CardHeader>
                <CardBody className="space-y-4">
                  <p className="text-sm text-slate-600">use your firebase email + password</p>
                  <Input label="email" type="email" value={authEmail} onValueChange={setAuthEmail} />
                  <Input label="password" type="password" value={authPassword} onValueChange={setAuthPassword} />
                  {authError ? <p className="text-sm text-rose-600">{authError}</p> : null}
                  <div className="flex gap-2">
                    <Button color="primary" isLoading={authLoading} onPress={handleSignIn}>
                      Sign In
                    </Button>
                    <Button variant="flat" isLoading={authLoading} onPress={handleCreateAccount}>
                      Create Account
                    </Button>
                  </div>
                </CardBody>
              </Card>
            ) : (
              <div className="space-y-5">
                <Card className="border border-sky-100 bg-white/90">
                  <CardHeader className="flex items-center justify-between">
                    <h2 className="text-2xl font-semibold text-slate-900">Register Participant</h2>
                    <Button size="sm" variant="flat" onPress={handleSignOut}>
                      Sign Out
                    </Button>
                  </CardHeader>
                  <CardBody className="grid gap-3 md:grid-cols-3">
                    <Input label="name" value={riderName} onValueChange={setRiderName} />
                    <Input label="bike number" value={bikeNumber} onValueChange={setBikeNumber} />
                    <Button color="primary" className="md:mt-6" onPress={registerRider}>
                      Add Registration
                    </Button>
                  </CardBody>
                </Card>

                <div className="grid gap-4 md:grid-cols-2">
                  <Card className="border border-amber-100 bg-white/90">
                    <CardHeader>
                      <h3 className="text-xl font-semibold text-slate-900">Registered</h3>
                    </CardHeader>
                    <Divider />
                    <CardBody className="space-y-2">
                      {riders.filter((r) => r.status === 'registered').length === 0 ? (
                        <p className="text-slate-500">no one in registration queue</p>
                      ) : (
                        riders
                          .filter((r) => r.status === 'registered')
                          .map((rider) => (
                            <div
                              key={rider.id}
                              className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2"
                            >
                              <p className="font-medium">{rider.name}</p>
                              <Button size="sm" color="warning" variant="flat" onPress={() => moveToOnTrack(rider.id)}>
                                Move To On Track
                              </Button>
                            </div>
                          ))
                      )}
                    </CardBody>
                  </Card>

                  <Card className="border border-emerald-100 bg-white/90">
                    <CardHeader>
                      <h3 className="text-xl font-semibold text-slate-900">On Track</h3>
                    </CardHeader>
                    <Divider />
                    <CardBody className="space-y-2">
                      {riders.filter((r) => r.status === 'on-track').length === 0 ? (
                        <p className="text-slate-500">nobody on track yet</p>
                      ) : (
                        riders
                          .filter((r) => r.status === 'on-track')
                          .map((rider) => (
                            <div
                              key={rider.id}
                              className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2"
                            >
                              <p className="font-medium">{rider.name}</p>
                              <Button size="sm" color="success" variant="flat" onPress={() => markReturned(rider.id)}>
                                Mark Returned
                              </Button>
                            </div>
                          ))
                      )}
                    </CardBody>
                  </Card>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
