import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import Home from "@/pages/Home";
import Sites from "@/pages/Sites";
import Processes from "@/pages/Processes";
import Login from "@/pages/Login";
import Deploy from "@/pages/Deploy";
import Deployments from "@/pages/Deployments";
import Projects from "@/pages/Projects";
import Providers from "@/pages/Providers";
import Limits from "@/pages/Limits";
import Settings from "@/pages/Settings";
import Admin from "@/pages/Admin";
import AI from "@/pages/AI";
import Monitoring from "@/pages/Monitoring";
import Logs from "@/pages/Logs";
import Templates from "@/pages/Templates";
import Containers from "@/pages/Containers";
import Domains from "@/pages/Domains";
import Databases from "@/pages/Databases";
import Storage from "@/pages/Storage";
import Automation from "@/pages/Automation";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function AuthRouter() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [location, setLocation] = useLocation();
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  useEffect(() => {
    fetch(`${base}/api/auth/check`, { credentials: "include" })
      .then(r => {
        if (r.ok) {
          setAuthed(true);
        } else {
          setAuthed(false);
          if (location !== "/login") setLocation("/login");
        }
      })
      .catch(() => {
        setAuthed(false);
        if (location !== "/login") setLocation("/login");
      });
  }, []);

  if (authed === null) {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
        <div style={{ width: 28, height: 28, border: "3px solid var(--border)", borderTopColor: "#007AFF", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/" component={Home} />
      <Route path="/deploy" component={Deploy} />
      <Route path="/real" component={Deploy} />
      <Route path="/deployments" component={Deployments} />
      <Route path="/projects" component={Projects} />
      <Route path="/providers" component={Providers} />
      <Route path="/limits" component={Limits} />
      <Route path="/settings" component={Settings} />
      <Route path="/admin" component={Admin} />
      <Route path="/ai" component={AI} />
      <Route path="/monitoring" component={Monitoring} />
      <Route path="/logs" component={Logs} />
      <Route path="/templates" component={Templates} />
      <Route path="/containers" component={Containers} />
      <Route path="/domains" component={Domains} />
      <Route path="/databases" component={Databases} />
      <Route path="/storage" component={Storage} />
      <Route path="/automation" component={Automation} />
      <Route path="/sites" component={Sites} />
      <Route path="/processes" component={Processes} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthRouter />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
