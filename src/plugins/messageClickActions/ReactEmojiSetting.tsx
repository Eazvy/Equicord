/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Heading } from "@components/Heading";
import type { IPluginOptionComponentProps } from "@utils/types";
import type { Channel } from "@vencord/discord-types";
import { findByCodeLazy } from "@webpack";
import { ChannelStore, Popout, SelectedChannelStore, TextInput, useRef, useState, useStateFromStores } from "@webpack/common";

import { settings } from ".";

export const MAX_ADDITIONAL_REACT_EMOJIS = 8;

type EmojiSelectPayload = {
    id?: string | null;
    name?: string | null;
    optionallyDiverseSequence?: string;
    animated?: boolean;
};

type ReactionEmojiPickerProps = {
    channel?: Channel | null;
    closePopout(): void;
    onSelectEmoji(selection: {
        emoji: EmojiSelectPayload | null;
        willClose: boolean;
    }): void;
};

const ReactionEmojiPicker = findByCodeLazy(
    "showAddEmojiButton:",
    "pickerIntention:",
    "messageId:"
) as React.ComponentType<ReactionEmojiPickerProps>;

function parseCustomEmoji(value: string) {
    return value.match(/^(?:<(?:(a):)?|:)?([\w-]+?)(?:~\d+)?:([0-9]+)>?$/);
}

function getEmojiValue(emoji: EmojiSelectPayload | null | undefined) {
    if (!emoji) return "";
    if (emoji.id && emoji.name) return `${emoji.name}:${emoji.id}`;
    if (emoji.optionallyDiverseSequence?.trim()) return emoji.optionallyDiverseSequence;
    return emoji.name?.trim() ?? "";
}

function toRenderedEmoji(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const customEmoji = parseCustomEmoji(trimmed);
    if (customEmoji) {
        return {
            kind: "custom" as const,
            id: customEmoji[3],
            name: customEmoji[2],
            animated: customEmoji[1] === "a"
        };
    }

    return {
        kind: "unicode" as const,
        name: trimmed,
        animated: false
    };
}

function getCustomEmojiSources(id: string, animated: boolean) {
    const host = window.GLOBAL_ENV.CDN_HOST;
    const base = `https://${host}/emojis/${id}`;

    return {
        primary: `${base}.${animated ? "gif" : "png"}?size=48&quality=lossless`,
        fallback: `${base}.png?size=48&quality=lossless`
    };
}

function CustomEmojiPreview({
    id,
    name,
    animated
}: {
    id: string;
    name: string;
    animated: boolean;
}) {
    const { primary, fallback } = getCustomEmojiSources(id, animated);
    const [failedPrimary, setFailedPrimary] = useState(false);

    return (
        <img
            src={failedPrimary ? fallback : primary}
            alt={name}
            width={34}
            height={34}
            style={{ display: "block" }}
            onError={() => {
                if (!failedPrimary && primary !== fallback) {
                    setFailedPrimary(true);
                }
            }}
        />
    );
}

function EmojiPickerButton({
    onSelect,
    children
}: {
    onSelect(value: string): void;
    children?: React.ReactNode;
}) {
    const triggerRef = useRef<HTMLDivElement>(null);
    const channel = useStateFromStores([SelectedChannelStore, ChannelStore], () => {
        const channelId = SelectedChannelStore.getChannelId();
        return channelId ? ChannelStore.getChannel(channelId) : null;
    });

    return (
        <Popout
            position="bottom"
            align="left"
            targetElementRef={triggerRef}
            renderPopout={({ closePopout }) => (
                <ReactionEmojiPicker
                    channel={channel}
                    closePopout={closePopout}
                    onSelectEmoji={({ emoji, willClose }) => {
                        const nextValue = getEmojiValue(emoji);
                        if (nextValue) onSelect(nextValue);
                        if (willClose) closePopout();
                    }}
                />
            )}
        >
            {popoutProps => (
                <div
                    {...popoutProps}
                    ref={triggerRef}
                    style={{
                        minWidth: 46,
                        height: 46,
                        padding: "0 8px",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 8,
                        background: "var(--background-secondary-alt)",
                        border: "1px solid var(--input-border)",
                        cursor: "pointer",
                        lineHeight: 1
                    }}
                >
                    {children ?? "Pick Emoji"}
                </div>
            )}
        </Popout>
    );
}

function parseEmojiList(value: string) {
    return Array.from(new Set(
        value
            .split(/[\n,]/g)
            .map(entry => entry.trim())
            .filter(Boolean)
    )).slice(0, MAX_ADDITIONAL_REACT_EMOJIS);
}

export function ReactEmojiSetting({ setValue }: IPluginOptionComponentProps) {
    const [emoji, setEmoji] = useState(settings.store.reactEmoji ?? "💀");
    const renderedEmoji = toRenderedEmoji(emoji);

    return (
        <div>
            <Heading>Select Emoji For Reactions</Heading>
            <div
                style={{
                    marginTop: 8,
                    display: "inline-flex",
                    alignItems: "center"
                }}
            >
                <EmojiPickerButton
                    onSelect={newValue => {
                        setEmoji(newValue);
                        setValue(newValue);
                    }}
                >
                    {renderedEmoji != null
                        ? renderedEmoji.kind === "custom"
                            ? <CustomEmojiPreview
                                id={renderedEmoji.id}
                                name={renderedEmoji.name}
                                animated={renderedEmoji.animated}
                            />
                            : <span style={{ fontSize: 28, lineHeight: 1 }}>{renderedEmoji.name}</span>
                        : "Pick Emoji"}
                </EmojiPickerButton>
            </div>
        </div>
    );
}

export function AdditionalReactEmojisSetting({ setValue }: IPluginOptionComponentProps) {
    const { addAdditionalReacts } = settings.use(["addAdditionalReacts"]);
    const [emojiList, setEmojiList] = useState(settings.store.additionalReactEmojis ?? "");

    if (!addAdditionalReacts) return null;

    return (
        <div>
            <Heading>Select Additional Emojis</Heading>
            <div
                style={{
                    marginTop: 8,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    maxWidth: 420
                }}
            >
                <TextInput
                    value={emojiList}
                    placeholder={`comma/newline separated, max ${MAX_ADDITIONAL_REACT_EMOJIS}`}
                    onChange={newValue => {
                        setEmojiList(newValue);
                        setValue(newValue);
                    }}
                    onClick={event => event.stopPropagation()}
                    onMouseDown={event => event.stopPropagation()}
                    style={{
                        flex: 1
                    }}
                />
                <EmojiPickerButton
                    onSelect={newValue => {
                        const parsed = parseEmojiList(emojiList);
                        const merged = parsed.includes(newValue)
                            ? parsed
                            : [...parsed, newValue].slice(0, MAX_ADDITIONAL_REACT_EMOJIS);
                        const nextValue = merged.join(", ");
                        setEmojiList(nextValue);
                        setValue(nextValue);
                    }}
                />
            </div>
        </div>
    );
}
