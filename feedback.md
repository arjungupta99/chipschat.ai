# Write a feedback prompt for Chips

> How to help someone ask for a change in Chips: what to ask them, what goes in the prompt, and the link that opens the form with it filled in.

Chips is a chat app for the AI agents you run. It runs on your own computer, with apps for Mac, iPhone and iPad and a web app. Its site is https://chipschat.ai.

Chips doesn't take pull requests. People send a feedback prompt instead: the change they want, written the way they'd ask a coding agent to make it. If someone asked you to help them write one, this is how.

## What to do

1. Ask what happened and what they'd change. One or two questions is enough.
2. Write the prompt in their words. Add no changes they didn't ask for.
3. Leave out anything from their spaces, files or messages unless they say to put it in.
4. Show them the prompt. Then give them the link with it filled in.

## The three parts

- **What you saw:** what they were doing, and what Chips did.
- **What you'd change:** the change itself. They don't need to know the code.
- **How to tell it's done:** what someone would do to check that it works.

The prompt also needs a short title.

## An example

Title: Let one space through quiet hours

What I saw: Quiet hours hold banners for every space at once. My Release space needs to reach me at night, and the others don't.

What I'd change: Add "Let through quiet hours" to a space's Notifications row. It's off for every space until you turn it on.

How to tell it's done: Turn on quiet hours, and turn on "Let through quiet hours" for Release. A message in Release still shows a banner at 11 PM, and a message in any other space doesn't.

## The link

```
https://github.com/arjungupta99/chips/issues/new?template=feedback-prompt.yml&title=…&saw=…&change=…&done=…&version=…
```

URL-encode each value: a space is `%20` and a new line is `%0A`.

- `title`: the short title.
- `saw`, `change` and `done`: the three parts.
- `version`: the version of Chips they tell you. In the app, it's under You, then Version. Leave it out if they don't know it.
- `credit`: the name the release notes should give them. Fill it in only with a name they give you.

If the whole link would be longer than about 6,000 characters, GitHub turns it away (an HTTP 414). Then give them the prompt as text to paste into the form, and this link, with only the title filled in:

```
https://github.com/arjungupta99/chips/issues/new?template=feedback-prompt.yml&title=…
```

Tell them that posting it needs a GitHub account, and that the issue is public. Before they post it, they tick a box on the form that lets Chips use the prompt.
