# The figure for s07: the text says the supplement beat placebo at every visit; the plotted data say otherwise.
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
weeks = [0, 2, 4, 8, 12]
drug = [6.3, 5.6, 5.2, 5.1, 5.2]
plac = [6.2, 5.7, 5.1, 4.7, 4.4]
ci = 0.35
fig, ax = plt.subplots(figsize=(7.2, 4.4), dpi=110)
ax.errorbar(weeks, drug, yerr=ci, marker="o", capsize=4, color="#1f5fa8", label="Saffronwort (n = 64)")
ax.errorbar([w + 0.15 for w in weeks], plac, yerr=ci, marker="s", capsize=4, color="#a8481f", linestyle="--",
            label="Placebo (n = 63)")
ax.set_xticks(weeks)
ax.set_xlabel("Week")
ax.set_ylabel("Mean knee pain (0 to 10, higher is worse)")
ax.set_ylim(3.5, 7.0)
ax.set_title("Figure 2. Mean knee pain by visit (error bars: 95% CI)", fontsize=10)
ax.legend(frameon=False)
ax.grid(axis="y", alpha=0.3)
fig.tight_layout()
fig.savefig("cases/s07-figure-contradicts-text.png")
