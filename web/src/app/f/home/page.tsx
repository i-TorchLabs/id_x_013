import Home from "@/views/Home";
import { AuthGuard } from "@/components/AuthGuard";

export default function HomePage() {
  return (
    <AuthGuard>
      <Home />
    </AuthGuard>
  );
}
