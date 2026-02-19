import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SocialProviders } from "@/components/auth/social-providers";
import { signIn, signUp } from "@/lib/auth-client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

type AuthDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

const AUTH_EMAIL_CACHE_KEY = "auth:last-email";

export const AuthDialog = ({ open, onOpenChange, onSuccess }: AuthDialogProps) => {
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const signinEmailRef = useRef<HTMLInputElement>(null);
  const signupNameRef = useRef<HTMLInputElement>(null);
  const configs = useMemo(
    () => ({
      email_auth_enabled: "true",
      google_auth_enabled: "true",
      github_auth_enabled: "true",
    }),
    []
  );

  const reset = () => {
    setPassword("");
    setName("");
  };

  const handleSuccess = () => {
    reset();
    onOpenChange(false);
    onSuccess?.();
  };

  const handleSignIn = async () => {
    if (loading) return;
    if (!email || !password) {
      toast.error("Email and password are required");
      return;
    }

    await signIn.email(
      { email, password },
      {
        onRequest: () => setLoading(true),
        onResponse: () => setLoading(false),
        onSuccess: () => {
          localStorage.setItem(AUTH_EMAIL_CACHE_KEY, email);
          handleSuccess();
        },
        onError: (ctx) => {
          toast.error(ctx.error.message || "Sign in failed");
          setLoading(false);
        },
      }
    );
  };

  const handleSignUp = async () => {
    if (loading) return;
    if (!email || !password || !name) {
      toast.error("Name, email and password are required");
      return;
    }

    await signUp.email(
      { email, password, name },
      {
        onRequest: () => setLoading(true),
        onResponse: () => setLoading(false),
        onSuccess: () => {
          localStorage.setItem(AUTH_EMAIL_CACHE_KEY, email);
          handleSuccess();
        },
        onError: (ctx) => {
          toast.error(ctx.error.message || "Sign up failed");
          setLoading(false);
        },
      }
    );
  };

  useEffect(() => {
    if (!open) return;
    const cachedEmail = localStorage.getItem(AUTH_EMAIL_CACHE_KEY);
    if (cachedEmail) {
      setEmail(cachedEmail);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      if (tab === "signin") {
        signinEmailRef.current?.focus();
      } else {
        signupNameRef.current?.focus();
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, tab]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">
            {tab === "signin" ? "登录" : "注册"}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(val) => setTab(val as "signin" | "signup")}>
          <TabsList className="mb-4">
            <TabsTrigger value="signin">登录</TabsTrigger>
            <TabsTrigger value="signup">注册</TabsTrigger>
          </TabsList>
          <TabsContent value="signin" className="space-y-4">
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="signin-email">Email</Label>
                <Input
                  id="signin-email"
                  ref={signinEmailRef}
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="signin-password">Password</Label>
                <Input
                  id="signin-password"
                  type="password"
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
              </div>
              <Button className="w-full" disabled={loading} onClick={handleSignIn}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "登录"}
              </Button>
            </div>
            <SocialProviders
              configs={configs}
              callbackUrl="/"
              loading={loading}
              setLoading={setLoading}
            />
          </TabsContent>

          <TabsContent value="signup" className="space-y-4">
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="signup-name">Name</Label>
                <Input
                  id="signup-name"
                  ref={signupNameRef}
                  type="text"
                  placeholder="Your Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="signup-email">Email</Label>
                <Input
                  id="signup-email"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="signup-password">Password</Label>
                <Input
                  id="signup-password"
                  type="password"
                  placeholder="Create a password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
              </div>
              <Button className="w-full" disabled={loading} onClick={handleSignUp}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "注册"}
              </Button>
            </div>
            <SocialProviders
              configs={configs}
              callbackUrl="/"
              loading={loading}
              setLoading={setLoading}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default AuthDialog;
