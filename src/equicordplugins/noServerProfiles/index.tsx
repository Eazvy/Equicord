/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { EquicordDevs } from "@utils/constants";
import definePlugin from "@utils/types";
import { findComponentByCodeLazy, findExportedComponentLazy } from "@webpack";
import { FluxDispatcher, GuildMemberStore, IconUtils, SelectedGuildStore, UserProfileStore, UserStore, useState } from "@webpack/common";

const UserSquareIcon = findExportedComponentLazy("UserSquareIcon");
const PopoutActionButton = findComponentByCodeLazy("tooltipText:", "__unsupportedReactNodeAsText", "onMouseLeave:", "loading:");

let activeUserId = null;
let serverProfileEnabled = false;

function PopoutActionToggle({ onToggle }) {
    const [enabled, setEnabled] = useState(true);

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
    patches: [
        {
            find: /getGuildMemberProfile\(\i,\i\);return/,
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
            find: '"data-username-has-gradient":',
            replacement: {
                match: /children:\i\?(?=.{0,50}effectDisplayType:\i\?\i\.\i\.ANIMATED)/,
                replace: "children:null!==arguments[0]?.author?.displayNameStyles?"
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
            find: ".GUILD_NEW_MEMBER_ACTIONS_ICON,path:",
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
            find: ".has_bounced_email??",
            replacement: {
                match: /(\i)=null!=(\i)\?this\.guildMemberAvatars\[\i\]:void 0/,
                replace: "$1=$self.isEnabled(this.id)&&null!=$2?this.guildMemberAvatars[$2]:void 0"
            }
        },
        {
            find: "?.collectibles?.nameplate)??",
            replacement: {
                match: /\(0,(\i\.\i)\)\((\i)\?\.collectibles\?\.nameplate\)\?\?\i\.nameplate/,
                replace: " $self.getPrimaryResolvedNameplate($2,arguments[0]?.user,$1)"
            }
        },
        {
            find: /#{intl::UNKNOWN_USER_MENTION_PLACEHOLDER}\):\i\(/,
            replacement: {
                match: /\i\.\i\.getNick\(\i,(\i)\.id\);/,
                replace: "$self.getPrimaryNickname(arguments[0],arguments[2]);"
            }
        },
        {
            find: "Result cannot be null because the message is not null",
            all: true,
            replacement: {
                match: /null:\i\.\i\.getMember\(\i,(\i)\)/,
                replace: "null:$self.getPrimaryMember(arguments[0]?.author?.id,$1)"
            }
        },
        {
            find: /&&\i!==\i\.\i\.FRIEND\)return/,
            replacement: [
                {
                    match: /\(0,\i\.jsxs?\).{0,150}toastShowing:\i\}\)/,
                    replace: " $self.renderPopoutActionToggle(arguments[0].user.id,$&)"
                },
                {
                    match: /\(0,\i\.jsxs?\).{0,150}setFriendRequestSent:\i\}\)/,
                    replace: " $self.renderPopoutActionToggle(arguments[0].user.id,$&)"
                }
            ]
        }
    ],

    isEnabled(userId) {
        return activeUserId === userId && serverProfileEnabled;
    },

    toggleUser(userId, enabled) {
        serverProfileEnabled = enabled;

        const user = UserStore.getUser(userId);
        if (user) FluxDispatcher.dispatch({ type: "USER_UPDATE", user });

        const guildId = SelectedGuildStore.getGuildId();
        const member = guildId ? GuildMemberStore.getMember(guildId, userId) : null;
        if (user && member) FluxDispatcher.dispatch({ type: "GUILD_MEMBER_UPDATE", user, ...member });
    },

    getDisplayProfile(userId, userProfile, guildProfile, merge) {
        if (!userProfile || !UserStore.getUser(userId)) return null;
        return merge(userProfile, this.isEnabled(userId) ? guildProfile : null);
    },

    getPrimaryResolvedNameplate(member, user, resolveNameplate) {
        if (!user) return null;
        return resolveNameplate(this.isEnabled(user.id) ? member?.collectibles?.nameplate : user.collectibles?.nameplate) ?? user.nameplate ?? null;
    },

    getDisplayNameStyles(guildMember, user) {
        if (!user || !this.isEnabled(user.id)) return user?.displayNameStyles;
        return guildMember?.displayNameStyles ?? user.displayNameStyles;
    },

    getAvatarDecoration(guildMember, user) {
        return this.isEnabled(user.id)
            ? guildMember?.avatarDecoration ?? user.avatarDecoration
            : user.avatarDecoration;
    },

    getPrimaryNickname(guildId, user) {
        return this.isEnabled(user.id)
            ? GuildMemberStore.getMember(guildId, user.id)?.nick ?? null
            : null;
    },

    getPrimaryMember(guildId, userId) {
        const member = GuildMemberStore.getMember(guildId, userId);
        if (!member || this.isEnabled(userId)) return member;
        return {
            ...member,
            avatar: null,
            avatarDecoration: null,
            collectibles: null,
            colorRoleId: void 0,
            colorString: void 0,
            colorStrings: null,
            displayNameStyles: null,
            nick: null
        };
    },

    getGuildMemberAvatarURL(original) {
        return (member, canAnimate) => {
            if (this.isEnabled(member.userId) || member.avatar == null) return original(member, canAnimate);

            const user = UserStore.getUser(member.userId);
            return user
                ? IconUtils.getUserAvatarURL(user, Boolean(canAnimate)) ?? original(member, canAnimate)
                : original(member, canAnimate);
        };
    },

    getGuildMemberAvatarURLSimple(original) {
        return data => {
            if (this.isEnabled(data.userId) || data.avatar == null) return original(data);

            const user = UserStore.getUser(data.userId);
            return user
                ? IconUtils.getUserAvatarURL(user, Boolean(data.canAnimate), data.size) ?? original(data)
                : original(data);
        };
    },

    renderPopoutActionToggle(userId, action) {
        const guildId = SelectedGuildStore.getGuildId();
        if (!guildId || !this.hasGuildProfileOverride(userId, guildId)) return action;

        activeUserId = userId;
        serverProfileEnabled = false;

        return (
            <>
                <PopoutActionToggle
                    onToggle={enabled => this.toggleUser(userId, enabled)}
                />
                {action}
            </>
        );
    },

    hasGuildProfileOverride(userId, guildId) {
        const member = GuildMemberStore.getMember(guildId, userId);
        const profile = UserProfileStore.getGuildMemberProfile(userId, guildId);

        return [
            member?.nick,
            member?.avatar,
            member?.avatarDecoration,
            member?.displayNameStyles,
            member?.collectibles?.nameplate,
            profile?.banner,
            profile?.bio,
            profile?.pronouns,
            profile?.themeColors,
            profile?.profileEffect,
            profile?.profileEffectId
        ].some(Boolean);
    }
});
