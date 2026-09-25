# Headline and number font options

_Started 2026-09-25 13:56 UTC_

---

## User

Continuing from "Budget planner app design".

## Assistant

We were building out a budget planner app for people who want to track spending, understand their left-to-spend number, and manage bills, debt and savings goals. The app needed to be simple, clean, low-overwhelm and ADHD-friendly, with quick logging and clear visibility into what money is available right now.

We've made solid progress. The app now has a full onboarding flow (currency choice, income, budget period, bills, spending plan), four main tabs (Home, Bills, Debt, Goals), and all the core features working: quick spending log with category buttons, "left to spend" calculation, bills calendar with paydays, debt payoff plans (Snowball/Avalanche/Minimums) with an overpayment slider showing interest savings, and saving goals with a planning calculator. Settings lets users change currency, run setup again, and reset to test data. Users can also add/remove spending categories on the fly in Edit budget, and edit or remove any debt or goal.

Key decisions we made: the app lives in the browser so data persists, it starts fresh on each major build so users test with clean sample data, the extra money slider on Debt works in $10 steps and frees up money either goes to the next debt or back to spending depending on a "Roll over" toggle, the planning calculator on Goals lets users toggle between choosing a monthly amount or a target timeframe before saving as a new goal, and the app remembers whether the user prefers web or mobile view.

Right now the app is fully functional in Budget Planner v6.dc.html with test data loaded. We've also created separate style exploration files (Home Styles.dc.html for four layout variations, and Colour Styles.dc.html with four colour/font skins of the original) but those are reference only.

Next steps would be: pick a final colour and font direction from the style files, test edge cases (very long category lists, very old budget periods, etc.), and consider mobile refinements like spacing and tap targets.

Budget Planner v6.dc.html is the live prototype. Home Styles.dc.html and the four Colour Styles files are exploration reference.

## User

Give me options to switch the font of the headlines and numbers (not the body). Not sure yet I like the font.

## Assistant

_[tool: grep]_

_[tool: run_script]_

_[tool: run_script]_

_[tool: run_script]_

_[tool: ready_for_verification]_

There's now a **Headline font** option in Tweaks, under "Type". It changes the font for every headline and number in the app; body text stays in Figtree. The choices are:

- **Bricolage** (the one you have now)
- **Sora**: geometric and crisp
- **Space Grotesk**: slightly techy, with distinctive numbers
- **Outfit**: clean and friendly
- **Nunito**: rounded and soft, the calmest of the set
- **Young Serif**: warm serif
- **Newsreader**: editorial serif

## User

I like space grotesque but it needs more weight, can you make it look good and not cheap?

## Assistant

_[tool: run_script]_

_[tool: show_html]_

_[tool: ready_for_verification]_

I've made Space Grotesk heavier and tidied up how it sits:
- **Weight:** headlines and numbers now use Bold, the heaviest weight the font has.
- **Tighter letter spacing:** it's a bit wide by default, so I pulled the letters closer together.
- **Numbers:** they're now all the same width, so amounts line up and don't shift around when they change.
- **Alternate letter shapes:** I switched on one of the font's built-in style sets, which gives it a cleaner, more distinctive look.

Only Space Grotesk changed. Sora and Nunito got their own weight tweaks too, and the other fonts look the same as before.

## User

now add an option to change to dark mode and create a dark mode that will suit the current style ensuring best practices and accessibility aspects for dark mode are taken into account

## Assistant

_[tool: run_script]_

_[tool: run_script]_

_[tool: run_script]_

_[tool: grep]_

_[tool: read_file]_

_[tool: grep]_

_[tool: run_script]_

_[tool: run_script]_

_[tool: run_script]_

_[tool: ready_for_verification]_

I've added a dark mode and two ways to turn it on. It's out for a check now; I haven't looked at it in dark mode myself yet, so the charts, the bills calendar and onboarding are the places to test first.

**Turning it on**
- **Header button:** a Dark/Light button next to Settings switches straight away. It's only in the web view header.
- **Settings:** a new Appearance choice with Light, Dark or Match device. Match device follows your phone or computer setting and updates if that changes.
- The app remembers your choice.

**How it looks**
- **Backgrounds:** warm near-black instead of pure black, so it's easier on the eyes. Cards sit slightly lighter than the page, which gives the sense of depth that shadows would in light mode.
- **Text:** off-white rather than pure white, to cut glare. Secondary grey text still passes the standard contrast requirements.
- **Colours:** the green, amber, red and category colours are lighter so they stay readable on dark. Green buttons now have dark text, which is more readable on the lighter green.
- **Built-in controls:** dropdowns, scrollbars and the date picker switch to dark as well.
- **Light mode** looks exactly as before.

## User

remove the shadows in dark mode under the tiles and the white headings and numbers is a little too bright, it's difficult to read. don't dared as much as the body but a little

## Assistant

_[tool: grep]_

_[tool: run_script]_

_[tool: ready_for_verification]_

I made both changes to dark mode; light mode is unchanged. I haven't checked them visually, so please switch to dark mode to confirm.

- **Shadows:** the four tiles and panels that had shadows no longer show them in dark mode, including the one you edited. The small highlight on the selected option in toggle buttons is still there.
- **Headings and numbers:** toned down slightly so they're less bright, but still brighter than the body text.

## User

ok now keep the prototype as is but create some more variations in separate files, again keep structure the same, just colours and fonts with these themes: candy pop, arcade, lemon squeeze, serene

## User

Found issues — fixing…

## User

Found issues — fixing…

## Assistant

_[tool: run_script]_

_[tool: ready_for_verification]_

I fixed a quoting mistake in the font settings that stopped all four theme files from loading. Candy Pop is being checked again now; Arcade, Lemon Squeeze and Serene had the same one-line fix but I haven't reopened them yet.

## User

ok you can go a little bit more out and creative with the variations, just keep the overall structure the same but doesn't have to be exactly the same size of tiles and style etc. Now do it again, redo those variations, the ones you provided were too boring.

## Assistant

_[tool: run_script]_

_[tool: run_script]_

_[tool: run_script]_

_[tool: ready_for_verification]_

I've redone all four themes with bolder styling. The layout and features are the same in each; each theme also has its own dark mode. Arcade is open now and out for a check. I haven't viewed Candy Pop, Lemon Squeeze or Serene on screen yet.

- **Candy Pop:** a polka-dot pink page with sticker-style tiles: thick plum outlines and a solid offset shadow. The four summary tiles are mint, lemon, lilac and peach. Headlines are in Baloo 2, and the big left-to-spend number has a pink drop shadow.
- **Arcade:** a graph-paper grid page, square corners, heavy black outlines and chunky offset shadows. Headings are in a pixel font and all caps; the big number has a pink and cyan double shadow. In dark mode the outlines turn neon cyan.
- **Lemon Squeeze:** a bright yellow page with white tiles in bold black outlines and near-black buttons. The summary tiles are lime, white, orange and cream. Headlines are in a wide, heavy font (Unbounded), with the big number made larger.
- **Serene:** a soft sage, blue and lilac wash with frosted-glass tiles and gentle shadows. Headlines are in an italic serif, with a larger, lighter big number.

Two things to know:
- **Headline fonts:** Arcade's headlines use Space Grotesk in your view because you changed that setting earlier. Pick "Pixelify" in the headline font setting to see the pixel look.
- **Summary tile colours:** in Candy Pop, Arcade and Lemon Squeeze these are fixed. They no longer change colour to reflect status, such as a warning when you've overspent.

## User

Candy pop is great. Let's refine it a little - the colours of the categories don't go with it, change the entire colour palette to be in line with the rest (popping more). Give me a way to change the backgrounds because I'm not sure this works

## Assistant

_[tool: run_script]_

_[tool: ready_for_verification]_

I've recoloured Candy Pop and added a way to switch backgrounds. It's out for a check now; I haven't viewed the new colours or backgrounds on screen myself yet.

- **Category colours:** all 11 are now bright candy shades: sky blue, grape, bubblegum, aqua, lemon, mint, tangerine, periwinkle, lime, magenta and green. The over-budget red and warning amber are punchier pink-reds and orange to match. Dark mode has softer versions of each.
- **Backgrounds:** a new Background setting under "Look" in Tweaks has six choices: Polka dots, Candy stripes, Gingham, Sprinkles, Bubblegum (plain pink) and Clean (near-white). Each also has a dark-mode version.

## User

Found issues — fixing…

## Assistant

_[tool: grep]_

_[tool: run_script]_

_[tool: ready_for_verification]_

I fixed the category colours not updating. Your categories are saved in the browser with their old colours, so Candy Pop now swaps each one for its candy version as the app loads. Groceries is now hot pink, and Uncategorised a soft mauve instead of grey. It's out for a check now; I haven't looked at it on screen myself.

## User

on bills move the box of Money in so it aligns with the calendar. On debt move the payoff plan below the single debts like it's on the goals tab

## Assistant

_[tool: grep]_

_[tool: read_file]_

_[tool: run_script]_

_[tool: ready_for_verification]_

I made both layout changes in Candy Pop; they're out for a check now.

- **Bills:** the "Money in" heading now sits inside its box, so the box's top lines up with the calendar's.
- **Debt:** "Your payoff plan" now comes after the individual debt cards, the same order as on Goals.

## User

indicate on the main total you owe tile which payment plan is activated with a link to below as it's not obvious when it's at the bottom of the site

## Assistant

_[tool: run_script]_

_[tool: run_script]_

_[tool: ready_for_verification]_

The "Total you owe" tile in Candy Pop now shows which payment plan is active, such as "Avalanche plan · Change ↓". Tapping it scrolls smoothly down to "Your payoff plan". It's out for a check now.

## User

The edit budgets button is the same colour as the bubblegum background so vanishes, make it visible

## Assistant

_[tool: grep]_

_[tool: str_replace_edit]_

_[tool: ready_for_verification]_

The "Edit budget" button in Candy Pop is now white with a plum outline and a small offset shadow, like the other buttons, so it no longer blends into the Bubblegum background. I haven't looked at it on screen yet.

## User

Add to the settings a customise theme option where the user can change the font and choose between: Baloo (default), Sora, Outfit, Nunito, Young Serif and the backgrounds: Candy stripes (default), Polka dots, Gingham, Sprinkles and Bubblegum

## Assistant

_[tool: run_script]_

_[tool: run_script]_

_[tool: ready_for_verification]_

Settings in Candy Pop now has a "Customise theme" section, below Appearance; it's out for a check now.

- **Headline font:** Baloo (default), Sora, Outfit, Nunito or Young Serif. Each option shows a sample in its own font.
- **Background:** Candy stripes (default), Polka dots, Gingham, Sprinkles or Bubblegum. Each option shows a small preview of the pattern.

Changes apply straight away and are remembered. What you pick in Settings overrides the matching options in Tweaks.

## User

remove the Nunito font and gingham background so it's just one row of options

## Assistant

_[tool: run_script]_

_[tool: ready_for_verification]_

I removed Nunito and Gingham from "Customise theme" in Settings. Each row now has four options that stay on one line, even on narrow screens:

- **Fonts:** Baloo, Sora, Outfit, Young Serif
- **Backgrounds:** Candy stripes, Polka dots, Sprinkles, Bubblegum

I made the font samples slightly smaller so they fit. Both options still appear in the Tweaks panel lists.

