import type { RemixDTO } from "@/lib/remix-types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export function RemixCard({ remix }: { remix: RemixDTO }) {
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            {remix.trendKey}
          </span>
          <Badge variant="outline">{remix.platform}</Badge>
          <span className="text-xs text-muted-foreground">
            {new Date(remix.createdAt).toLocaleString()}
          </span>
        </div>
        {remix.trendTitle ? (
          <p className="text-xs text-muted-foreground">
            Remixed from: {remix.trendTitle}
            {remix.sourceUrl ? (
              <>
                {" · "}
                <a
                  href={remix.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4"
                >
                  original
                </a>
              </>
            ) : null}
          </p>
        ) : null}
        <p className="font-serif text-lg font-semibold leading-snug">{remix.hook}</p>
        <pre className="whitespace-pre-wrap rounded-md bg-secondary/60 p-4 text-sm leading-relaxed text-foreground">
          {remix.script}
        </pre>
        {remix.caption ? (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Caption: </span>
            {remix.caption}
          </p>
        ) : null}
        {remix.differentiator ? (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Why it differentiates: </span>
            {remix.differentiator}
          </p>
        ) : null}
        {remix.hashtags.length ? (
          <div className="flex flex-wrap gap-2">
            {remix.hashtags.map((tag) => (
              <Badge key={tag} variant="secondary">
                #{tag}
              </Badge>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
