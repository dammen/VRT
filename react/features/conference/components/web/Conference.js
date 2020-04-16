// @flow

import _ from 'lodash';
import React from 'react';

import VideoLayout from '../../../../../modules/UI/videolayout/VideoLayout';
import {openConnection} from "../../../../../connection"
import { connect, disconnect } from '../../../base/connection';
import { translate } from '../../../base/i18n';
import { connect as reactReduxConnect } from '../../../base/redux';
import { Chat } from '../../../chat';
import { Filmstrip } from '../../../filmstrip';
import { CalleeInfoContainer } from '../../../invite';
import { LargeVideo } from '../../../large-video';
import { LAYOUTS, getCurrentLayout } from '../../../video-layout';

import roomData from '../../../../rooms.web';

import {
    Toolbox,
    fullScreenChanged,
    setToolboxAlwaysVisible,
    showToolbox
} from '../../../toolbox';

import { maybeShowSuboptimalExperienceNotification } from '../../functions';

import Labels from './Labels';
import { default as Notice } from './Notice';
import { default as Subject } from './Subject';
import {
    AbstractConference,
    abstractMapStateToProps
} from '../AbstractConference';
import type { AbstractProps } from '../AbstractConference';
import "./conference.css"

declare var APP: Object;
declare var config: Object;
declare var interfaceConfig: Object;

/**
 * DOM events for when full screen mode has changed. Different browsers need
 * different vendor prefixes.
 *
 * @private
 * @type {Array<string>}
 */
const FULL_SCREEN_EVENTS = [
    'webkitfullscreenchange',
    'mozfullscreenchange',
    'fullscreenchange'
];

/**
 * The CSS class to apply to the root element of the conference so CSS can
 * modify the app layout.
 *
 * @private
 * @type {Object}
 */
const LAYOUT_CLASSNAMES = {
    [LAYOUTS.HORIZONTAL_FILMSTRIP_VIEW]: 'horizontal-filmstrip',
    [LAYOUTS.TILE_VIEW]: 'tile-view',
    [LAYOUTS.VERTICAL_FILMSTRIP_VIEW]: 'vertical-filmstrip'
};

/**
 * The type of the React {@code Component} props of {@link Conference}.
 */
type Props = AbstractProps & {

    /**
     * Whether the local participant is recording the conference.
     */
    _iAmRecorder: boolean,

    /**
     * The CSS class to apply to the root of {@link Conference} to modify the
     * application layout.
     */
    _layoutClassName: string,

    dispatch: Function,
    t: Function
}

/**
 * The conference page of the Web application.
 */
class Conference extends AbstractConference<Props, *> {
    _onFullScreenChange: Function;
    _onShowToolbar: Function;
    _originalOnShowToolbar: Function;

    /**
     * Initializes a new Conference instance.
     *
     * @param {Object} props - The read-only properties with which the new
     * instance is to be initialized.
     */
    constructor(props) {
        super(props);

        const urlArray = window.location.href.split("/")
        const houseName = urlArray[urlArray.length -1].split("-")[0]
        const rooms = roomData[houseName] || roomData.default;
        this.roomsConfig = rooms;
        // used to fetch roomInfo
        this.roomsArgs = rooms.map(room => room.mainRoom ? houseName : houseName + '-' + room.name).join("_")
        this.houseName = houseName
        this.state = {
            houseInfo: rooms,
            hoverIndex: -1
          }         // Throttle and bind this component's mousemove handler to prevent it
        // from firing too often.
        this._originalOnShowToolbar = this._onShowToolbar;
        this._onShowToolbar = _.throttle(
            () => this._originalOnShowToolbar(),
            100,
            {
                leading: true,
                trailing: false
            });

        // Bind event handler so it is only bound once for every instance.
        this._onFullScreenChange = this._onFullScreenChange.bind(this);
    }

    /**
     * Start the connection and get the UI ready for the conference.
     *
     * @inheritdoc
     */
    componentDidMount() {
        document.title = interfaceConfig.APP_NAME;
        this._start();
        try {
            setInterval(async () => {
                fetch("/room?roomname=" + this.roomsArgs).then((res)=>
                    {
                        if(res.status == 200) {
                            return res.text();
                        }
                        else {
                            console.warn("Couldnt fetch houseInfo");
                            return;
                        }
                    }).then((data) => {
                        const houseInfo = JSON.parse(data);
                        const tempHouseInfo = []
                        this.state.houseInfo.forEach(room => {
                            let roomInfo = null;
                            if (room.mainRoom) {
                                roomInfo = houseInfo.find(obj => obj.room_name === this.houseName)
                            } else {
                                roomInfo = houseInfo.find(obj => obj.room_name ===  this.houseName + "-" + room.name)
                            }
                            if (roomInfo) {
                                tempHouseInfo.push({
                                    ...room, 
                                    count: roomInfo.count,
                                    users: roomInfo.count !== 0 && roomInfo.users
                                })
                            }
                        });
                        this.setState({
                            houseInfo: tempHouseInfo
                        })
                    }
                )
             
            }, 2000);
            
        } catch (err) {
            console.log(err);
        }
    }


    /**
     * Calls into legacy UI to update the application layout, if necessary.
     *
     * @inheritdoc
     * returns {void}
     */
    componentDidUpdate(prevProps) {
        if (this.props._shouldDisplayTileView
            === prevProps._shouldDisplayTileView) {
            return;
        }

        // TODO: For now VideoLayout is being called as LargeVideo and Filmstrip
        // sizing logic is still handled outside of React. Once all components
        // are in react they should calculate size on their own as much as
        // possible and pass down sizings.
        VideoLayout.refreshLayout();
    }

    /**
     * Disconnect from the conference when component will be
     * unmounted.
     *
     * @inheritdoc
     */
    componentWillUnmount() {
        APP.UI.unbindEvents();

        FULL_SCREEN_EVENTS.forEach(name =>
            document.removeEventListener(name, this._onFullScreenChange));

        APP.conference.isJoined() && this.props.dispatch(disconnect());
    }

    /**
     * Implements React's {@link Component#render()}.
     *
     * @inheritdoc
     * @returns {ReactElement}
     */
    render() {
        const {
            VIDEO_QUALITY_LABEL_DISABLED,

            // XXX The character casing of the name filmStripOnly utilized by
            // interfaceConfig is obsolete but legacy support is required.
            filmStripOnly: filmstripOnly
        } = interfaceConfig;
        const hideVideoQualityLabel
            = filmstripOnly
                || VIDEO_QUALITY_LABEL_DISABLED
                || this.props._iAmRecorder;


        var pathArray = window.location.href.split( '/' );
        var baseUrl = pathArray[0] + '//' + pathArray[2];

        const houseName = pathArray[3].split("-")[0];
        const roomAttributes = roomData[houseName] || roomData.default;
        return (
            <div
                className = { this.props._layoutClassName }
                id = 'videoconference_page'
                onMouseMove = { this._onShowToolbar }>
                <Notice />
                <Subject />
                <div id = 'videospace'>
                    <LargeVideo />
                    { hideVideoQualityLabel
                        || <Labels /> }
                    <Filmstrip filmstripOnly = { filmstripOnly } />
                    <div className="sub-room-overview" style={{
                        position:"absolute",
                        top: "150px",
                        left: "0px",
                        bottom: "150px",
                        width: "120px",
                        zIndex: "5"
                    }}>
                        {this.state.houseInfo.length > 0 && this.state.houseInfo.map((room, index) => {
                          const url = `${baseUrl}/${room.mainRoom ? houseName : houseName + '-' + room.name}`; 
                          return (
                            <a 
                                onMouseOver={e => {
                                    this.setState({hoverIndex: index})
                                }}
                                onMouseOut={e => {
                                    this.setState({hoverIndex: -1})
                                }} 
                                href={ url } className="subRoom1">
                                <div
                                    className="subRoom2"
                                    style={{
                                        backgroundColor: room.color
                                    }}
                                    
                                    >
                                    {room.name}
                                    <span>({room.count ? room.count : 0})</span>
                                    {this.state.hoverIndex == index &&
                                        <>
                                            {room.users ? 
                                                room.users.map(user => <span>{user}</span>) 
                                                : 
                                                <span>no users</span>
                                            }
                                        </>
                                    }
                                </div>
                            </a>
                          )
                        })}
                    </div>
                </div>

                { filmstripOnly || <Toolbox /> }
                { filmstripOnly || <Chat /> }

                { this.renderNotificationsContainer() }

                <CalleeInfoContainer />
            </div>
        );
    }

    /**
     * Updates the Redux state when full screen mode has been enabled or
     * disabled.
     *
     * @private
     * @returns {void}
     */
    _onFullScreenChange() {
        this.props.dispatch(fullScreenChanged(APP.UI.isFullScreen()));
    }

    /**
     * Displays the toolbar.
     *
     * @private
     * @returns {void}
     */
    _onShowToolbar() {
        this.props.dispatch(showToolbox());
    }

    /**
     * Until we don't rewrite UI using react components
     * we use UI.start from old app. Also method translates
     * component right after it has been mounted.
     *
     * @inheritdoc
     */
    _start() {
        APP.UI.start();

        APP.UI.registerListeners();
        APP.UI.bindEvents();

        FULL_SCREEN_EVENTS.forEach(name =>
            document.addEventListener(name, this._onFullScreenChange));

        const { dispatch, t } = this.props;

        dispatch(connect());

        maybeShowSuboptimalExperienceNotification(dispatch, t);

        interfaceConfig.filmStripOnly
            && dispatch(setToolboxAlwaysVisible(true));
    }
}

/**
 * Maps (parts of) the Redux state to the associated props for the
 * {@code Conference} component.
 *
 * @param {Object} state - The Redux state.
 * @private
 * @returns {Props}
 */
function _mapStateToProps(state) {
    const currentLayout = getCurrentLayout(state);

    return {
        ...abstractMapStateToProps(state),
        _iAmRecorder: state['features/base/config'].iAmRecorder,
        _layoutClassName: LAYOUT_CLASSNAMES[currentLayout]
    };
}

export default reactReduxConnect(_mapStateToProps)(translate(Conference));
