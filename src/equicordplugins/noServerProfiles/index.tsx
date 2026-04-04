/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { EquicordDevs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { UserProfile } from "@vencord/discord-types";
import { findExportedComponentLazy, findComponentByCodeLazy } from "@webpack";
import { FluxDispatcher, GuildMemberStore, IconUtils, SelectedGuildStore, UserProfileStore, UserStore, useEffect, useState } from "@webpack/common";
import type { ReactNode } from "react";

const settings = definePluginSettings({
    enabledUsers: {
        type: OptionType.STRING,
        description: "Per-user server profile overrides.",
        hidden: true,
        default: "{}"
    }
});

type DisplayProfileMerge = (userProfile: UserProfile, guildProfile: UserProfile | null) => unknown;
type EnabledUsers = Record<string, boolean>;
type GuildAvatarData = Parameters<typeof IconUtils.getGuildMemberAvatarURLSimple>[0];

const UserSquareIcon = findExportedComponentLazy("UserSquareIcon");
const PopoutActionButton = findComponentByCodeLazy("tooltipText:", "__unsupportedReactNodeAsText", "onMouseLeave:", "loading:")

function parseEnabledUsers(raw?: string): EnabledUsers {
    try {
        return JSON.parse(raw || "{}");
    } catch {
        return {};
    }
}

const getEnabledUsers = () => parseEnabledUsers(settings.store.enabledUsers);

function PopoutActionToggle({ userId, onToggle }: { userId: string; onToggle: (enabled: boolean) => void; }) {
    const stored = Boolean(parseEnabledUsers(settings.use().enabledUsers)[userId]);
    const [enabled, setEnabled] = useState(stored);

    useEffect(() => setEnabled(stored), [stored]);

    return (
        <PopoutActionButton
            icon={props => <UserSquareIcon {...props} color={enabled ? "var(--white-500)" : "var(--interactive-muted)"} />}
            tooltipText={enabled ? "Use main profile" : "Use server profile"}
            onClick={() => {
                const next = !enabled;
                setEnabled(next);
                onToggle(next);
            }}
        />
    );
}

export default definePlugin({
    name: "NoServerProfiles",
    description: "Shows Main Profile rather than server profile by default, with option to toggle between them.",
    authors: [EquicordDevs.omaw],
    settings,
    requiresRestart: true,
    patches: [
        {
            find: "getGuildMemberProfile(e,t);return",
            replacement: {
                match: /:(\i)\((\i),(\i)\)(?=\}\})/,
                replace: ":$self.getDisplayProfile(arguments[0],$2,$3,$1)"
            }
        },
        {
            find: "location:\"useDisplayNameStyles\"",
            replacement: {
                match: /:(\i)\?\.displayNameStyles\?\?(\i)\?\.displayNameStyles:null/,
                replace: ":$self.getDisplayNameStyles($1,$2):null"
            }
        },
        {
            find: "data-username-has-gradient",
            replacement: {
                match: /children:\i\?(?=.{0,120}displayNameStyles:(\i),)/,
                replace: "children:null!=$1?"
            }
        },
        {
            find: /avatarDecoration:\i\.avatarDecoration/,
            replacement: {
                match: /return [^?]{0,40}\?(\i)\?\.avatarDecoration:(\i)\.avatarDecoration/,
                replace: "return $self.getAvatarDecoration($1,$2)"
            }
        },
        {
            find: /getGuildMemberAvatarURL:\i,getGuildMemberAvatarURLSimple:\i/,
            replacement: [
                {
                    match: /(getGuildMemberAvatarURL:)(\i),/,
                    replace: "$1$self.getGuildMemberAvatarURL($2),"
                },
                {
                    match: /(getGuildMemberAvatarURLSimple:)(\i),/,
                    replace: "$1$self.getGuildMemberAvatarURLSimple($2),"
                }
            ]
        },
        {
            find: "getGuildMemberAvatarURLSimple({guildId:e,avatar:i,userId:this.id",
            replacement: {
                match: /(\i)=null!=(\i)\?this\.guildMemberAvatars\[\2\]:void 0/,
                replace: "$1=$self.isUserEnabled(this.id)&&null!=$2?this.guildMemberAvatars[$2]:void 0"
            }
        },
        {
            find: /nameplate\)\?\?\i\.nameplate/,
            replacement: {
                match: /\(0,(\i)\.(\i)\)\((\i)\?\.collectibles\?\.nameplate\)\?\?(\i)\.nameplate/,
                replace: " $self.getPrimaryResolvedNameplate($3,$4,$1.$2)"
            }
        },
        {
            find: "if(e?.isPrivate())return a.A.getNickname(n.id)",
            replacement: {
                match: /if\(null!=(\i)\)return \i\.(\i)\.getNick\(\1,(\i)\.id\);/,
                replace: "if(null!=$1)return $self.getPrimaryNickname($1,$3);"
            }
        },
        {
            find: "Result cannot be null because the message is not null",
            all: true,
            replacement: {
                match: /\(\)=>null==(\i)\|\|null==(\i)\?null:\i\.(\i)\.getMember\(\1,\2\)/,
                replace: "()=>null==$1||null==$2?null:$self.getPrimaryMember($1,$2)"
            }
        },
        {
            find: "hasOutgoingPendingGameFriends:g,hasIncomingPendingGameFriends:A",
            replacement: [
                {
                    match: /\(0,\i\.jsx\)\(\i\.\i,\{user:\i,relationshipType:\i,[^}]{0,120}\}\)/,
                    replace: " $self.renderPopoutActionToggle(arguments[0].user.id,$&)"
                },
                {
                    match: /\(0,\i\.jsx\)\(\i\.\i,\{userId:\i\.id,[^}]{0,120}setFriendRequestSent:\i\}\)/,
                    replace: " $self.renderPopoutActionToggle(arguments[0].user.id,$&)"
                }
            ]
        }
    ],

    toggleUser(userId: string, enabled: boolean) {
        const enabledUsers = getEnabledUsers();
        enabled ? enabledUsers[userId] = true : delete enabledUsers[userId];
        settings.store.enabledUsers = JSON.stringify(enabledUsers);

        const user = UserStore.getUser(userId);
        if (user) FluxDispatcher.dispatch({ type: "USER_UPDATE", user });

        const guildId = SelectedGuildStore.getGuildId();
        const member = guildId ? GuildMemberStore.getMember(guildId, userId) : null;
        if (user && member) FluxDispatcher.dispatch({ type: "GUILD_MEMBER_UPDATE", user, ...member });
    },

    getDisplayProfile(userId: string, userProfile: UserProfile | null, guildProfile: UserProfile | null, merge: DisplayProfileMerge) {
        if (!userProfile || !UserStore.getUser(userId)) return null;
        return merge(userProfile, this.isUserEnabled(userId) ? guildProfile : null);
    },

    getPrimaryResolvedNameplate(member: { collectibles?: { nameplate?: unknown } | null } | null | undefined, user: { id: string; collectibles?: { nameplate?: unknown } | null; nameplate?: unknown } | null | undefined, resolveNameplate: (nameplate: unknown) => unknown) {
        if (!user) return null;
        return resolveNameplate(this.isUserEnabled(user.id) ? member?.collectibles?.nameplate : user.collectibles?.nameplate) ?? user.nameplate ?? null;
    },

    getDisplayNameStyles(guildMember: { displayNameStyles?: unknown | null } | null | undefined, user: { id: string; displayNameStyles?: unknown | null } | null | undefined) {
        if (!user || !this.isUserEnabled(user.id)) return user?.displayNameStyles;
        return guildMember?.displayNameStyles ?? user.displayNameStyles;
    },

    getAvatarDecoration(guildMember: { avatarDecoration?: unknown | null } | null | undefined, user: { id: string; avatarDecoration?: unknown | null }) {
        return this.isUserEnabled(user.id) ? guildMember?.avatarDecoration ?? user.avatarDecoration : user.avatarDecoration;
    },

    getPrimaryNickname(guildId: string, user: { id: string }) {
        return this.isUserEnabled(user.id) ? GuildMemberStore.getMember(guildId, user.id)?.nick ?? null : null;
    },

    getPrimaryMember(guildId: string, userId: string) {
        const member = GuildMemberStore.getMember(guildId, userId);
        if (!member || this.isUserEnabled(userId)) return member;
        return { ...member, avatar: null, avatarDecoration: null, collectibles: null, colorRoleId: void 0, colorString: void 0, colorStrings: null, displayNameStyles: null, nick: null };
    },

    getGuildMemberAvatarURL(original: typeof IconUtils.getGuildMemberAvatarURL) {
        return (member: Parameters<typeof IconUtils.getGuildMemberAvatarURL>[0], canAnimate?: Parameters<typeof IconUtils.getGuildMemberAvatarURL>[1]) => {
            if (this.isUserEnabled(member.userId) || member.avatar == null) return original(member, canAnimate);

            const user = UserStore.getUser(member.userId);
            return user ? IconUtils.getUserAvatarURL(user, Boolean(canAnimate)) ?? original(member, canAnimate) : original(member, canAnimate);
        };
    },

    getGuildMemberAvatarURLSimple(original: typeof IconUtils.getGuildMemberAvatarURLSimple) {
        return (data: GuildAvatarData) => {
            if (this.isUserEnabled(data.userId) || data.avatar == null) return original(data);

            const user = UserStore.getUser(data.userId);
            return user ? IconUtils.getUserAvatarURL(user, Boolean(data.canAnimate), data.size) ?? original(data) : original(data);
        };
    },

    renderPopoutActionToggle(userId: string, action: ReactNode) {
        const guildId = SelectedGuildStore.getGuildId();
        if (!guildId || !this.hasGuildProfileOverride(userId, guildId)) return action;
        return <><PopoutActionToggle userId={userId} onToggle={enabled => this.toggleUser(userId, enabled)} />{action}</>;
    },

    isUserEnabled(userId: string) {
        return Boolean(getEnabledUsers()[userId]);
    },

    hasGuildProfileOverride(userId: string, guildId: string) {
        const member = GuildMemberStore.getMember(guildId, userId) as {
            avatar?: string | null;
            avatarDecoration?: unknown | null;
            collectibles?: { nameplate?: unknown } | null;
            displayNameStyles?: unknown | null;
            nick?: string | null;
        } | null;
        const profile = UserProfileStore.getGuildMemberProfile(userId, guildId) as {
            banner?: string | null;
            bio?: string | null;
            pronouns?: string | null;
            themeColors?: unknown | null;
            profileEffect?: unknown | null;
            profileEffectId?: unknown | null;
        } | null;

        return [member?.nick, member?.avatar, member?.avatarDecoration, member?.displayNameStyles, member?.collectibles?.nameplate, profile?.banner, profile?.bio, profile?.pronouns, profile?.themeColors, profile?.profileEffect, profile?.profileEffectId].some(Boolean);
    }
});
