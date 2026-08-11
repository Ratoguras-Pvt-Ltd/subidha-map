export const metadata = {
  title: "You're offline",
};

export default function OfflinePage() {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-xl font-semibold">You&apos;re offline</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Subidha Gas needs an internet connection to load dealer locations and stock. Reconnect
        and try again.
      </p>
    </div>
  );
}
