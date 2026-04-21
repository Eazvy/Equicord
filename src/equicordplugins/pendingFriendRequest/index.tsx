/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { EquicordDevs } from "@utils/constants";
import definePlugin from "@utils/types";
import type { User } from "@vencord/discord-types";
import { RelationshipType } from "@vencord/discord-types/enums";
import { findByPropsLazy } from "@webpack";
import { Menu, RelationshipStore } from "@webpack/common";
import type { ComponentType } from "react";

type RelationshipActions = { cancelFriendRequest(userId: string, context: { location: string; }): Promise<void>; };
type UserContextProps = { user?: User; };
type RelationshipButtonContext = { user: User; analyticsLocation: string; relationshipType?: RelationshipType; hasOutgoingPendingGameFriends?: boolean; };
const USER_PROFILE_ANALYTICS_LOCATION = "USER_PROFILE";

const RelationshipActions = findByPropsLazy("cancelFriendRequest", "addRelationship") as RelationshipActions;

function isOutgoingFriendRequest(userId: string) {
    return RelationshipStore.getRelationshipType(userId) === RelationshipType.OUTGOING_REQUEST;
}

function cancelOutgoingFriendRequest(userId: string, location = USER_PROFILE_ANALYTICS_LOCATION) {
    if (!isOutgoingFriendRequest(userId)) return;
    return RelationshipActions.cancelFriendRequest(userId, { location });
}

const userContextPatch: NavContextMenuPatchCallback = (children, { user }: UserContextProps) => {
    if (!user || !isOutgoingFriendRequest(user.id)) return;

    children.push(
        <Menu.MenuItem
            id="vc-cancel-outgoing-friend-request"
            label="Cancel Outgoing Friend Request"
            action={() => cancelOutgoingFriendRequest(user.id)}
        />
    );
};

export default definePlugin({
    name: "CancelFriendRequest",
    description: "Adds a way to cancel outgoing friend requests from profiles.",
    authors: [EquicordDevs.omaw],

    contextMenus: {
        "user-profile-overflow-menu": userContextPatch
    },

    patches: [
        {
            find: "#{intl::rQSndv::raw}",
            replacement: {
                match: /variant:"primary",disabled:!0,text:\i\.intl\.string\(\i\.t#{intl::xMH6vD::raw}\)/,
                replace: "...$self.getCancelFriendRequestTextButtonProps(arguments[0].user.id)"
            }
        },
        {
            find: "#{intl::s/+byI::raw}",
            group: true,
            replacement: [
                {
                    match: /(\i=\{icon:(\i),.{0,100}\.\.\.\i)(\};return 0===)/g,
                    replace: "$1,...$self.getCancelFriendRequestIconButtonProps(arguments[0],$2)$3"
                },
                {
                    match: /disabled:!0/g,
                    replace: "disabled:!$self.isOutgoingButton(arguments[0])"
                }
            ]
        }
    ],

    isOutgoingButton({ relationshipType, hasOutgoingPendingGameFriends }: RelationshipButtonContext) {
        return relationshipType === RelationshipType.OUTGOING_REQUEST || hasOutgoingPendingGameFriends === true;
    },

    getCancelFriendRequestTextButtonProps(userId: string) {
        return {
            variant: "critical-secondary",
            onClick: () => cancelOutgoingFriendRequest(userId),
            text: "Cancel Outgoing Friend Request"
        };
    },

    getCancelFriendRequestIconButtonProps(context: RelationshipButtonContext, Icon?: ComponentType<Record<string, unknown>>) {
        if (!this.isOutgoingButton(context)) return {};

        const { user, analyticsLocation } = context;

        return {
            "aria-label": "Cancel Outgoing Friend Request",
            disabled: false,
            icon: Icon ? (iconProps: Record<string, unknown>) => <Icon {...iconProps} color="var(--status-danger)" /> : undefined,
            tooltipText: "Cancel Outgoing Friend Request",
            variant: "critical-secondary",
            onClick: () => cancelOutgoingFriendRequest(user.id, analyticsLocation)
        };
    }
});
