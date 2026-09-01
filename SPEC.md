# Overview

This app contains several tools for music practice and song-writing. It runs as a desktop app (Linux) as it's primary, full-featured platform.

Critically, this is not a DAW, it is practice and writing tool. High precision, complex editing, effects chains, etc. are not necessary.

# Platform Feature Support

Some features may not be available on all platforms. For example, splitting stems from an imported audio track may not be feasible on web or mobile.

Some features may require external tools, such as `ffmpeg`, `yt-dlp`, or `demucs`. On desktop, these tools should be considered to be available somewhere in the app's directory. For now, assume that the user will furnish these tools.

External tool execution must not block the app. Tasks run in the background with a queue that is visible to the user. When a task completes it is marked done in the queue and the task is automatically removed from the UI after a few seconds. Failed tasks must be dismissed from the queue manaually. For each task in the queue the app shows:
- A brief descriptive title for the task
- A progress indicator (where possible) for long-running tasks
- A way to view the console log for a task, in the event that it fails
- A way to dismiss a task that has finished or failed

# Basic Structure

The basic unit of organization is a song. Users create a song and then fill it in by importing or downloading audio tracks, writing lyrics, and recording themselves.

- A song has a name and artist. These are editable by the user. New songs are given some default name (e.g. "New Song") and no artist.
- Song data is stored on the user's device, one directory per song, all within some common library directory
- A song has multiple channels that contain song data. Each channel syncs to the master song timeline
- There are several types of song channel:
    - *Audio Channel* - Audio data, such as an imported track or recorded snippet
    - *Metronome Channel* - Click track, used as count-in (before song starts) or mid-song in the case where drums drop out
- User can view their library of songs, sorting by song name (default) or artist
- Choosing a song from the library unloads the current song (stopping playback if necessary) and loads the chosen one
- The app remember the last loaded song and loads it automatically when the app starts next time
- Songs can be deleted from library. This removes all song data, including configuration and audio files.

## Audio Channels

- Audio channels can be added to a song in these ways:
    - Import an audio file from disk, either by selection or drag-and-drop
    - Download audio from a URL (e.g. using `yt-dlp`) (e.g. from YouTube)
    - Recording from a device audio input
- Audio channels have a user-editable name
- Audio files are converted to a format that optimizes for small disk footprint and ability to smoothly scrub through the audio (Ogg seems to work well here)
- Audio channels can be demuxed into individual instruments
    - This happens locally on the users machine, perhaps using a local installation of `demucs`
    - The user can select which instruments they wish to extract (vocals, drums, bass, piano, guitar, other)
    - Extracted stems are imported into the song as new channels, named after the extracted instrument
    - The channel being split can optionally be muted as part of the split process
- Audio channels can span the whole song, starting at time 00:00 (the default) and ending when the song ends, or have a user-editable start time, in the case of recording smaller sections, fills, or harmonies

## Metronome Channels

- Several metronome channels can be added to a song
- A metronome channel plays an audio sample at a configurable BPM between some start and end time
- A metrnome channel supports several types of audio sample (e.g. woodblock, claves, hi-hat, cross-stick, kick) so the user can choose the sound that's right for the song
- The start time of a metronome channel can be negative, in the case of a count-in
- Metronomes are anchored by their end time, aligning the end of the last beat of the metronome to where the music naturally picks the beat back up
- The user can scrub through the waveform of an audio channel, zooming in/out to find the right spot, to align start/end times with the audio
- The user sets the metronome duration in one of these ways
    - *By Measure Count* - Indicate the BPM and how many measures to play. The start time is calculated backwards from the end time. Most useful for count-in channels.
    - *By Start Time* - Indicate an approximate BPM and align the start time to an audio waveform (same as aligning the end time). Number of beats/measures is automatically calculated to fill the duration based on given approximate BPM. Actual BPM is automatically nudged so that the clicks start right at the start time and the last click's beat finishes at the end time.

# Playback

- Once a song is loaded it can be played back
    - Each channel plays simultaneously, in sync with a master timeline clock, so that together they sound like a mixed song
- User can pause playback, which freezes the timeline and all channels. Unpausing resumes the channels at the place where they were paused
- Stopping playback stops all channels and returns the timeline to it's earliest point (which may be negative in the case of a channel with a negative start time, e.g. a count-in metronome channel)
- An interactive progress bar shows song progress and allows the user to scrub through the song.
    - Playback continues wherever the scrubber is left stationary
    - Scrubbing while a song is playing does not stop audio playback; the user can hear where in the song they are as they scrub in real-time
- User can adjust speed of playback by a percentage value
    - All channels respect this speed adjustment and sync to the timeline
    - Adjusting speed alone does not affect audio pitch.
- User can adjust the pitch of the song by +/- some number of semitones and cents
    - Audio channels play back at the new pitch
    - Metronome channels retain their original sound without pitch shift
    - Adjusting pitch alone does not change speed of playback.
- Adjust both speed and pitch at the same time works as expected, with each operating indepedently and cooperatively. (e.g. User can set +1 semitone at 80% speed and they hear a slower song that is tuned up)
- App-wide hot-key to play/pause playback is the space bar
- Audio channels can be muted and solo'd
    - Solo means that channel is the only one playing (along with any others that are solo'd)
    - Mute means that channel does not play, even if it's solo'd
    - Mute/solo state of each channel is saved automatically with the song so that it returns to the last state when the song is loaded again in the future
- Metronome channels can be muted but not solo'd
- While playing, the user can record some audio into a new channel
    - The new channel's start time is wherever the user started recording while the song was playing

# Lyrics Editor

- Lyrics editor works like a text editor
    - Most functions should be available via keyboard
    - Symbols and markers are denoted as text to make it easy to copy/paste to/from other applications
- User can write chord symbols above lyrics lines, roughly lining them up where the chords would fall (consider using a fixed width font to make alignment consistent)
- Chords for the whole song can be transposed up/down
- User can place markers to denote song sections (e.g. verse, chorus, bridge, etc.) or places where a section should be repeated

# Other Tools

These tools are summoned and dismissed on demand.

## Stand-Alone Metronome

- User can summon and dismiss a stand-alone metronome.
- User can adjust BPM, number of beats, whether to stress the first beat of each measure, and which audio sample to play
- Metronome configuration is automatically saved so it returns to the same state the next time the app is opened
- User can start/stop metronome with a UI button or with an app-wide hot-key (e.g. tilde key)
- Metronome displays a visual beat indicator. Each beat is denoted in a line and the current beat is highlighted as the metronome plays.

## Tuner

- User can summon/dismiss a tuner
- Tuner listens to an audio input device
- Tuner displays the nearest note it hears (based on A-440 Hz standard tuning) and shows how far away (cents) from that note the input audio is

## Rhyme Finder

- User enters a word and gets back a list of rhyming words
- Includes non-perfect/near rhymes

## Scale/Chord Charts

- User can see a list of chords that belong to a given scale/key
- Can also get related chord lists, like parallel and borrowed chords

# UI/UX

The app feels physical, not like a material-design web app. It feels more like a physical tool with buttons, sliders, and knobs that appear tactile. UI elements are large, not compact. Text is large and easy to read. Especially any lyrics or karaoke display must be readable from a distance.

The following link contains a mock-up of an example design. The actual app doesn't need to look or feel exactly like this but it demonstrates the physcial feel with raised & depressed buttons, grooved separators. Knobs operate either with scroll wheel or by click-and-drag.

https://claude.ai/code/artifact/f06304b2-9192-4b37-90e5-4577c5506266?org=5ee0da76-b637-4a41-83de-54cabeed182f

# Future (v2) Features

These features are candidates for future versions. Don't build them now, but be careful to design with their future in mind. These are listed in priority order.

- *A-B Looping* - Setup start/end points in a song and loop that section
- *Karaoke Channel* - Contains karaoke data that can be displayed when a song plays
- *Tool installation* - Automatically install and update any external tools (e.g. download `ffmpeg`, update `yt-dlp`, etc.)
- *Mobile app* - A stripped down mobile app that allows lyrics editing and related tools, metronome, tuner, and audio playback and record. Song data is synced to some cloud storage, preferrably something free or user-supplied (like Proton drive)
- *Click Track Patterns* - Use a pattern other than every beat to play a metronome channel (e.g. 2 half notes and 4 quarter notes instead of 8 quarter notes)
- *More platforms* - Support for Windows, Mac, and iOS
- *Web App* - Similar to mobile app

# Questionable Features

These are ideas that aren't clear yet. They may not be feasible.

- *Meter Analysis* - Some way to denote the rhythm/meter of lyrics and compare with the rhythm of the music to detect when a phrase or rhyme will be awkward to sing. I can't think of a way to build this without the UI being very cumbersome so it may not be worth building at all.
- *Rhyme Analysis* - Lyrics editor optionally shows rhymes and/or rhyme schemes. I'm not sure how useful this will be so may not be worth building.