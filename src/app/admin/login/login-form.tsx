"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login, type LoginState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Signing in…
        </>
      ) : (
        "Sign in"
      )}
    </Button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState<LoginState, FormData>(login, null);

  return (
    <Card>
      <CardContent className="pt-6">
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              autoFocus
              placeholder="admin@subidhagas.com.np"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>

          {state?.error ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {state.error}
            </p>
          ) : null}

          <SubmitButton />
        </form>
      </CardContent>
    </Card>
  );
}
