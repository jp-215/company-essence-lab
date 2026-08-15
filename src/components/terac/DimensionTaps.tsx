import {
  DIMENSIONS,
  DIMENSION_LABELS,
  RATINGS,
  type Dimension,
  type DimensionScores,
  type Rating,
} from "@/lib/terac/spec";

const RATING_LABEL: Record<Rating, string> = {
  weak: "Weak",
  okay: "Okay",
  strong: "Strong",
};

/**
 * The structured signal. Free text is optional and most judges skip it; these
 * six taps are what synthesis actually runs on, so they are the primary control
 * rather than a nice-to-have under a comment box.
 */
export function DimensionTaps({
  value,
  disabled,
  onChange,
}: {
  value: DimensionScores;
  disabled?: boolean;
  onChange: (next: DimensionScores) => void;
}) {
  return (
    <div className="space-y-2.5">
      {DIMENSIONS.map((dimension) => (
        <div key={dimension} className="flex items-center justify-between gap-3">
          <span className="min-w-0 flex-1 truncate text-[13px] text-neutral-300">
            {DIMENSION_LABELS[dimension]}
          </span>
          <div
            role="radiogroup"
            aria-label={DIMENSION_LABELS[dimension]}
            className="flex shrink-0 gap-1"
          >
            {RATINGS.map((rating) => {
              const selected = value[dimension] === rating;
              return (
                <button
                  key={rating}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={disabled}
                  onClick={() =>
                    onChange(
                      selected ? stripKey(value, dimension) : { ...value, [dimension]: rating },
                    )
                  }
                  className={[
                    "min-w-[3.9rem] rounded-md px-2.5 py-2 text-[12px] font-medium transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950",
                    "disabled:opacity-40",
                    selected
                      ? ratingClass(rating)
                      : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200",
                  ].join(" ")}
                >
                  {RATING_LABEL[rating]}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Contrast checked against the neutral-950 stage — not colour alone: the
 *  selected state also carries weight and a filled background. */
function ratingClass(rating: Rating): string {
  if (rating === "weak") return "bg-rose-300 text-rose-950";
  if (rating === "okay") return "bg-neutral-300 text-neutral-900";
  return "bg-emerald-300 text-emerald-950";
}

function stripKey(scores: DimensionScores, key: Dimension): DimensionScores {
  const next = { ...scores };
  delete next[key];
  return next;
}
