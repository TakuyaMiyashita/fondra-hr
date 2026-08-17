export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-muted/30 flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
