import { Link } from "react-router-dom";
import { Button } from "../components/ui.jsx";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="text-6xl font-semibold tracking-tight text-primary">404</div>
      <p className="text-muted-foreground">This page doesn't exist.</p>
      <Link to="/">
        <Button variant="outline">Back to home</Button>
      </Link>
    </div>
  );
}
