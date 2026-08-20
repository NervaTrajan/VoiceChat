import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  ChevronDown,
  CircleHelp,
  Gift,
  Hash,
  Headphones,
  Inbox,
  Laugh,
  LogOut,
  Mic,
  MicOff,
  Paperclip,
  Plus,
  Search,
  Send,
  Settings,
  SmilePlus,
  UserPlus,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { api, ApiMessage, initApi, savedToken, User } from "./api";
import { Room, RoomEvent, Track } from "livekit-client";

const channels = ["genel", "duyurular", "müzik", "oyun-sohbet"],
  colors = ["#f59e6b", "#77d7b6", "#9b8cff", "#69b7ff", "#ec78ac", "#e6c566"];
const members = [
  ["Mert", "Bir şeyler kodluyor"],
  ["Ece", "Lo-fi dinliyor"],
  ["Can", "VALORANT oynuyor"],
  ["Deniz", "Çevrimiçi"],
  ["Zeynep", "30 dk. önce"],
  ["Emir", "2 sa. önce"],
];
const colorFor = (name: string) =>
  colors[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % colors.length];
function Avatar({ name, small = false }: { name: string; small?: boolean }) {
  return (
    <div
      className={`avatar ${small ? "small" : ""}`}
      style={{ background: colorFor(name) }}
    >
      {name[0]?.toLocaleUpperCase("tr")}
    </div>
  );
}

function Auth({ onAuth }: { onAuth: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login"),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api.auth(mode, username, password);
      localStorage.setItem("sohbet_token", r.token);
      onAuth(r.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir hata oluştu.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="auth-screen">
      <div className="auth-glow" />
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-logo">V</div>
        <h1>{mode === "login" ? "Tekrar hoş geldin!" : "Voxora’ya katıl"}</h1>
        <p>
          {mode === "login"
            ? "Kaldığın yerden devam et."
            : "Yeni hesabını birkaç saniyede oluştur."}
        </p>
        <label>
          KULLANICI ADI
          <input
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
        </label>
        <label>
          ŞİFRE
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
          />
        </label>
        {error && <div className="auth-error">{error}</div>}
        <button className="auth-submit" disabled={busy}>
          {busy ? "Bekle..." : mode === "login" ? "Giriş yap" : "Hesap oluştur"}
        </button>
        <button
          type="button"
          className="auth-switch"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError("");
          }}
        >
          {mode === "login"
            ? "Hesabın yok mu? Kayıt ol"
            : "Zaten hesabın var mı? Giriş yap"}
        </button>
      </form>
    </main>
  );
}

export default function App() {
  const [ready, setReady] = useState(false),
    [user, setUser] = useState<User | null>(null),
    [channel, setChannel] = useState("genel"),
    [text, setText] = useState(""),
    [messages, setMessages] = useState<ApiMessage[]>([]),
    [search, setSearch] = useState(""),
    [error, setError] = useState(""),
    [voiceChannel, setVoiceChannel] = useState<string | null>(null),
    [voiceCount, setVoiceCount] = useState(0),
    [joiningVoice, setJoiningVoice] = useState(false),
    [muted, setMuted] = useState(false),
    [deafened, setDeafened] = useState(false),
    [friendsOpen, setFriendsOpen] = useState(false),
    [settingsOpen, setSettingsOpen] = useState(false);
  const socket = useRef<WebSocket | null>(null),
    liveRoom = useRef<Room | null>(null);
  const addMessage = (message: ApiMessage) =>
    setMessages((old) =>
      old.some((m) => m.id === message.id) ? old : [...old, message],
    );
  useEffect(() => {
    initApi().then(async () => {
      if (savedToken()) {
        try {
          setUser((await api.me()).user);
        } catch {
          localStorage.removeItem("sohbet_token");
        }
      }
      setReady(true);
    });
  }, []);
  useEffect(() => {
    if (!user) return;
    socket.current = api.socket(addMessage);
    return () => socket.current?.close();
  }, [user]);
  useEffect(() => {
    if (!user) return;
    setMessages([]);
    api
      .messages(channel)
      .then((r) => setMessages(r.messages))
      .catch((e) => setError(e.message));
  }, [channel, user]);
  const filtered = useMemo(
    () =>
      messages.filter((m) =>
        m.body.toLocaleLowerCase("tr").includes(search.toLocaleLowerCase("tr")),
      ),
    [messages, search],
  );
  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setText("");
    try {
      addMessage((await api.send(channel, body)).message);
    } catch (e) {
      setText(body);
      setError(e instanceof Error ? e.message : "Mesaj gönderilemedi.");
    }
  };
  const logout = async () => {
    try {
      await api.logout();
    } finally {
      localStorage.removeItem("sohbet_token");
      socket.current?.close();
      setUser(null);
    }
  };
  const leaveVoice = () => {
    liveRoom.current?.disconnect();
    liveRoom.current = null;
    setVoiceChannel(null);
    setVoiceCount(0);
  };
  const joinVoice = async (name: string) => {
    if (voiceChannel === name) {
      leaveVoice();
      return;
    }
    setJoiningVoice(true);
    setError("");
    try {
      leaveVoice();
      const credentials = await api.voiceToken(name);
      const room = new Room({ adaptiveStream: true, dynacast: true });
      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) track.attach();
      });
      room.on(RoomEvent.ParticipantConnected, () =>
        setVoiceCount(room.remoteParticipants.size + 1),
      );
      room.on(RoomEvent.ParticipantDisconnected, () =>
        setVoiceCount(room.remoteParticipants.size + 1),
      );
      room.on(RoomEvent.Disconnected, () => {
        setVoiceChannel(null);
        setVoiceCount(0);
      });
      await room.connect(credentials.url, credentials.token);
      await room.localParticipant.setMicrophoneEnabled(true);
      liveRoom.current = room;
      setVoiceChannel(name);
      setVoiceCount(room.remoteParticipants.size + 1);
    } catch (e) {
      leaveVoice();
      setError(e instanceof Error ? e.message : "Sesli kanala bağlanılamadı.");
    } finally {
      setJoiningVoice(false);
    }
  };
  const toggleMute = async () => {
    const next = !muted;
    try {
      if (liveRoom.current)
        await liveRoom.current.localParticipant.setMicrophoneEnabled(!next);
      setMuted(next);
    } catch {
      setError("Mikrofon durumu değiştirilemedi.");
    }
  };
  const toggleDeafen = () => {
    const next = !deafened;
    liveRoom.current?.remoteParticipants.forEach((p) =>
      p.audioTrackPublications.forEach((pub) => {
        if (pub.track) {
          if (next) pub.track.detach();
          else pub.track.attach();
        }
      }),
    );
    setDeafened(next);
    if (next && !muted) {
      void liveRoom.current?.localParticipant.setMicrophoneEnabled(false);
      setMuted(true);
    }
  };
  useEffect(
    () => () => {
      void liveRoom.current?.disconnect();
    },
    [],
  );
  if (!ready)
    return (
      <div className="loading">
        <div className="auth-logo">V</div>
        <span>Başlatılıyor…</span>
      </div>
    );
  if (!user) return <Auth onAuth={setUser} />;
  return (
    <main className="app-shell">
      <aside className="servers">
        <button className="brand server active">V</button>
        <div className="separator" />
        {["OY", "MU", "TA"].map((s, i) => (
          <button
            className="server"
            key={s}
            style={{ background: ["#ef946c", "#69b7aa", "#9b7fd4"][i] }}
          >
            {s}
          </button>
        ))}
        <button className="server add">
          <Plus size={22} />
        </button>
      </aside>
      <aside className="channels">
        <header className="workspace-title">
          Voxora Community <ChevronDown size={17} />
        </header>
        <div className="channel-scroll">
          <section>
            <div className="section-title">
              <span>
                <ChevronDown size={13} /> METİN KANALLARI
              </span>
              <Plus size={15} />
            </div>
            {channels.map((c) => (
              <button
                key={c}
                onClick={() => setChannel(c)}
                className={`channel ${channel === c ? "selected" : ""}`}
              >
                <Hash size={19} />
                <span>{c}</span>
                {c === "genel" && (
                  <UserPlus className="channel-action" size={16} />
                )}
              </button>
            ))}
          </section>
          <section>
            <div className="section-title">
              <span>
                <ChevronDown size={13} /> SESLİ KANALLAR
              </span>
              <Plus size={15} />
            </div>
            {["Muhabbet", "Oyun Odası", "Sessiz Çalışma"].map((c) => (
              <div key={c}>
                <button
                  disabled={joiningVoice}
                  onClick={() => joinVoice(c)}
                  className={`channel voice ${voiceChannel === c ? "voice-active" : ""}`}
                >
                  <Volume2 size={18} />
                  <span>{c}</span>
                  {voiceChannel === c && <small>{voiceCount}</small>}
                </button>
                {voiceChannel === c && (
                  <div className="voice-user live">
                    <Avatar name={user.username} small />
                    <span>{user.username}</span>
                    <i>CANLI</i>
                  </div>
                )}
              </div>
            ))}
          </section>
        </div>
        {voiceChannel && (
          <div className="voice-status">
            <b>Ses bağlantısı kuruldu</b>
            <span>{voiceChannel} · LiveKit</span>
            <button onClick={leaveVoice}>Bağlantıyı kes</button>
          </div>
        )}
        <div className="user-panel">
          <Avatar name={user.username} small />
          <div className="user-meta">
            <b>{user.username}</b>
            <span>
              {muted
                ? "Mikrofon kapalı"
                : voiceChannel
                  ? "Sesli kanalda"
                  : "Çevrimiçi"}
            </span>
          </div>
          <button
            className={muted ? "control-active" : ""}
            title={muted ? "Mikrofonu aç" : "Sessize al"}
            onClick={toggleMute}
          >
            {muted ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
          <button
            className={deafened ? "control-active" : ""}
            title={deafened ? "Sesi aç" : "Sağırlaştır"}
            onClick={toggleDeafen}
          >
            {deafened ? <VolumeX size={18} /> : <Headphones size={18} />}
          </button>
          <button title="Ayarlar" onClick={() => setSettingsOpen(true)}>
            <Settings size={18} />
          </button>
          <button title="Çıkış yap" onClick={logout}>
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <section className="chat">
        <header className="topbar">
          <Hash size={22} />
          <b>{channel}</b>
          <div className="divider" />
          <span className="topic">Ekibin gündelik sohbet kanalı</span>
          <div className="top-actions">
            <Bell />
            <button
              title="Arkadaşlar"
              onClick={() => setFriendsOpen(!friendsOpen)}
              className={friendsOpen ? "top-active" : ""}
            >
              <UserPlus />
            </button>
            <div className="search">
              <input
                placeholder="Ara"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Search size={16} />
            </div>
            <Inbox />
            <CircleHelp />
          </div>
        </header>
        <div className="messages">
          <div className="welcome">
            <div className="hash-bubble">
              <Hash size={33} />
            </div>
            <h1>#{channel} kanalına hoş geldin!</h1>
            <p>
              Burası #{channel} kanalının başlangıcı. Sohbete katıl ve kendini
              göster.
            </p>
          </div>
          <div className="date-line">
            <span>SOHBET BAŞLANGICI</span>
          </div>
          {filtered.length === 0 && (
            <div className="empty-message">
              Henüz mesaj yok. İlk mesajı sen gönder!
            </div>
          )}
          {filtered.map((m) => (
            <article className="message" key={m.id}>
              <Avatar name={m.username} />
              <div className="message-body">
                <div>
                  <b>{m.username}</b>
                  <time>
                    {new Date(m.createdAt + "Z").toLocaleString("tr-TR", {
                      hour: "2-digit",
                      minute: "2-digit",
                      day: "numeric",
                      month: "short",
                    })}
                  </time>
                </div>
                <p>{m.body}</p>
              </div>
              <div className="message-tools">
                <Laugh />
                <SmilePlus />
              </div>
            </article>
          ))}
        </div>
        {friendsOpen && (
          <div className="friends-drawer">
            <div className="drawer-head">
              <h2>Arkadaşlar</h2>
              <button onClick={() => setFriendsOpen(false)}>
                <X />
              </button>
            </div>
            <input placeholder="Arkadaş ara" />
            {members.slice(0, 4).map((m) => (
              <Member key={m[0]} m={m} />
            ))}
          </div>
        )}
        {error && (
          <button className="error-toast" onClick={() => setError("")}>
            {error} ×
          </button>
        )}
        <div className="composer">
          <div className="input-wrap">
            <button>
              <Plus size={20} />
            </button>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) send();
              }}
              placeholder={`#${channel} kanalına mesaj gönder`}
            />
            <button>
              <Paperclip size={20} />
            </button>
            <button>
              <Gift size={20} />
            </button>
            <button>
              <SmilePlus size={20} />
            </button>
            <button className="send" onClick={send}>
              <Send size={18} />
            </button>
          </div>
        </div>
      </section>
      <aside className="members">
        <div className="member-title">ÇEVRİMİÇİ — 5</div>
        <div className="member">
          <div className="avatar-wrap">
            <Avatar name={user.username} small />
            <i />
          </div>
          <div>
            <b>{user.username} (Sen)</b>
            <span>Çevrimiçi</span>
          </div>
        </div>
        {members.slice(0, 4).map((m) => (
          <Member key={m[0]} m={m} />
        ))}
        <div className="member-title off">ÇEVRİMDIŞI — 2</div>
        {members.slice(4).map((m) => (
          <Member key={m[0]} m={m} offline />
        ))}
      </aside>
      {settingsOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSettingsOpen(false);
          }}
        >
          <section className="settings-modal">
            <button
              className="modal-close"
              onClick={() => setSettingsOpen(false)}
            >
              <X />
            </button>
            <h1>Kullanıcı Ayarları</h1>
            <div className="settings-profile">
              <Avatar name={user.username} />
              <div>
                <b>{user.username}</b>
                <span>Hesap ID: {user.id}</span>
              </div>
            </div>
            <h3>SES AYARLARI</h3>
            <div className="setting-row">
              <div>
                <b>Mikrofon</b>
                <span>Sesli kanallarda mikrofonunu kontrol et.</span>
              </div>
              <button onClick={toggleMute}>
                {muted ? "Mikrofonu Aç" : "Sessize Al"}
              </button>
            </div>
            <div className="setting-row">
              <div>
                <b>Gelen Ses</b>
                <span>Diğer kullanıcıların sesini kontrol et.</span>
              </div>
              <button onClick={toggleDeafen}>
                {deafened ? "Sesi Aç" : "Sağırlaştır"}
              </button>
            </div>
            <h3>UYGULAMA</h3>
            <div className="setting-row">
              <div>
                <b>Masaüstü bildirimleri</b>
                <span>Yeni mesajlarda bildirim göster.</span>
              </div>
              <input type="checkbox" defaultChecked />
            </div>
            <button
              className="save-settings"
              onClick={() => setSettingsOpen(false)}
            >
              Bitti
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
function Member({ m, offline = false }: { m: string[]; offline?: boolean }) {
  return (
    <div className={`member ${offline ? "offline" : ""}`}>
      <div className="avatar-wrap">
        <Avatar name={m[0]} small />
        <i />
      </div>
      <div>
        <b>{m[0]}</b>
        <span>{m[1]}</span>
      </div>
    </div>
  );
}
