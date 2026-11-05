import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  return (
    <main className="mx-auto w-full max-w-sm flex-1 px-6 py-16">
      <h1 className="text-2xl font-bold">スタッフのログイン</h1>
      <LoginForm next={typeof next === "string" ? next : undefined} />
    </main>
  );
}
