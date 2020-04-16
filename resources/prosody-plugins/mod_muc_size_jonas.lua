
local json = require "util.json";
local async_handler_wrapper = module:require "util".async_handler_wrapper;
local jid = require "util.jid";
local array = require"util.array";
local iterators = require "util.iterators";
local json = require "util.json";
local tostring = tostring;

local neturl = require "net.url";
local parse = neturl.parseQuery;
local get_room_from_jid = module:require "util".get_room_from_jid;

-- required parameter for custom muc component prefix,
-- defaults to "conference"
local muc_domain_prefix
    = module:get_option_string("muc_mapper_domain_prefix", "conference");


--[[ function get_info_rooms()
	log("warn", "getting info rooms");
	local innerValues = {};
    local keyRoom = "damba";
    for _, value in pairs(prosody.full_sessions) do
        log("warn", tostring(value["username"]:lower()));

        
		if tostring(value["username"]:lower()) ~= "focus" then
            for innerKey, innerValue in pairs(value) do
                if innerKey == keyRoom and not has_value(innerValues, innerValue) then
                    log("warn", innerValue);

					table.insert(innerValues, innerValue)
				end
			end
		end
    end
	return json.encode(innerValues);
	end
 ]]

 function mysplit (inputstr, sep)
	if sep == nil then
			sep = "%s"
	end
	local t={}
	for str in string.gmatch(inputstr, "([^"..sep.."]+)") do
			table.insert(t, str)
	end
	return t
end

-- TODO: ADD TOKEN VERIFICATION
--if not verify_token(params["token"], room_address) then
--    return { status_code = 403; };
--end

--- Handles request for retrieving the room participants details
-- @param event the http event, holds the request query
-- @return GET response, containing a json with participants details
function handle_get_rooms (event)
    if (not event.request.url.query) then
        return { status_code = 400; };
    end

    local params = parse(event.request.url.query);
	local room_names = params["roomname"];
	local domain_name = params["domain"];
	local rooms =  mysplit(room_names, "_");

	local payload = array();
	for _, room_name in pairs(rooms) do
		local room_address
			= jid.join(room_name, muc_domain_prefix.."."..domain_name);
		local room = get_room_from_jid(room_address);
		local participant_count = 0;
		local occupants_json = array();

		log("debug", "Querying room %s", tostring(room_address));

		if room then
			local occupants = room._occupants;
			if occupants then
				participant_count = iterators.count(room:each_occupant());
				for _, occupant in room:each_occupant() do
					-- filter focus as we keep it as hidden participant
					if string.sub(occupant.nick,-string.len("/focus"))~="/focus" then
						for _, pr in occupant:each_session() do
							local nick = pr:get_child_text("nick", "http://jabber.org/protocol/nick") or "unknown user";
							occupants_json:push(tostring(nick));
						end
					end
				end
			end
			log("debug",
				"there are %s occupants in room", tostring(participant_count));
		else
			log("debug", "no such room exists");
			occupants_json = nil;
		end

		if participant_count > 1 then
			participant_count = participant_count - 1;
		end
		payload:push({
			room_name = room_name,
			count = participant_count,
			users = occupants_json});
	end
	return { status_code = 200; body = json.encode(payload); };
end;


function module.load()
    module:depends("http");
	module:provides("http", {
		default_path = "/";
		route = {
            ["GET room"] = function (event) return async_handler_wrapper(event,handle_get_rooms) end;
			--["GET get-info-rooms"] = function (event) return async_handler_wrapper(event,get_info_rooms) end;

		};
	});
end