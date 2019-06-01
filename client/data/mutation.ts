import { client } from './apollo';
import gql from 'graphql-tag';
import { countTeams, countPlayers, queryTeamIDs, countHeroes } from './query';
import { IDota2TeamAggregateResponse, Notice, IDota2PlayerAggregateResponse, ITeamIDQueryResponse, IDota2HeroAggregateResponse } from '../types';

const apiBaseUrl = 'https://api.opendota.com/api';

export const insertTeamsMutation = gql`
  mutation insert_dota2_team($objects: [dota2_team_insert_input!]!) {
    insert_dota2_team(objects: $objects) {
      returning {
        team_name
      }
    }
  }
`;

export const insertPlayersMutation = gql`
  mutation insert_dota2_player($objects: [dota2_player_insert_input!]!) {
    insert_dota2_player(objects: $objects) {
      returning {
        player_name
      }
    }
  }
`;

export const insertHeroesMutation = gql`
  mutation insert_dota2_hero($objects: [dota2_hero_insert_input!]!) {
    insert_dota2_hero(objects: $objects) {
      returning {
        hero_name
      }
    }
  }
`;

export const insertTeamHeroesMutation = gql`
  mutation insert_dota2_team_hero($objects: [dota2_team_hero_insert_input!]!) {
    insert_dota2_team_hero(objects: $objects) {
      returning {
        id
      }
    }
  }
`;

export async function insertTeams(): Promise<Notice> {
  const { data: { dota2_team_aggregate: { aggregate: { count } } } } = await client.query<IDota2TeamAggregateResponse>({ query: countTeams });
  if (count > 0) {
    return {
      message: 'Team data already exists ¯\\_(ツ)_/¯',
      type: 'info'
    };
  }

  const teams = await (await fetch(apiBaseUrl + '/teams')).json();
  const mappedTeams = teams.map((t: any) => {
    const team = { ...t, team_name: t.name };
    delete team.name;
    return team;
  });


  await client.mutate({
    mutation: insertTeamsMutation,
    variables: { objects: mappedTeams }
  });

  return {
    message: 'Adding teams...',
    type: 'success'
  };
}

export async function insertPlayers(): Promise<Notice> {
  const { data: { dota2_player_aggregate: { aggregate } } } = await client.query<IDota2PlayerAggregateResponse>({ query: countPlayers });
  if (aggregate.count > 0) {
    return {
      message: 'Player data already exists',
      type: 'info'
    }
  }

  const players = await (await fetch(apiBaseUrl + '/proPlayers')).json();
  
  const { data: { dota2_team } } = await client.query<ITeamIDQueryResponse>({ query: queryTeamIDs })
  const teamIDs = dota2_team.map(t => t.team_id);
  const preparedPlayers = players.filter((p: any) => p.team_id && teamIDs.includes(p.team_id)).map((p: any) => {
    return {
      account_id: p.account_id,
      steam_id: p.steamid,
      avatar: p.avatar,
      avatar_medium: p.avatarmedium,
      avatar_full: p.avatarfull,
      profile_url: p.profileurl,
      persona_name: p.personaname,
      cheese: p.cheese,
      last_match_time: p.last_match_time,
      player_name: p.name,
      country_code: p.country_code,
      fantasy_role: p.fantasy_role,
      team_id: p.team_id,
      is_locked: p.is_locked,
      is_pro: p.is_pro
    };
  });

  const result = await client.mutate({ 
    mutation: insertPlayersMutation,
    variables: {
      objects: preparedPlayers
    }
  });
  
  return {
    message: `Added ${result.data.insert_dota2_player.returning.length} players`,
    type: 'success'
  }
}

export async function insertHeroes(): Promise<Notice> {
  const { data: { dota2_hero_aggregate: { aggregate } } } = await client.query<IDota2HeroAggregateResponse>({ query: countHeroes });

  if(aggregate.count > 0) { 
    return {
      message: `Heroes already exist`,
      type: 'info'
    } 
  }

  const response = await (await fetch(apiBaseUrl + '/heroes')).json();

  const heroes = response.map((h: any) => {
    return {
      hero_id: h.id,
      hero_name: h.name,
      localized_name: h.localized_name,
      primary_attr: h.primary_attr,
      attack_type: h.attack_type,
      /**
       * Send Postgres text[] values through as strings
       * https://github.com/hasura/graphql-engine/issues/1170
       */
      roles: `{${h.roles.join(',')}}`,
      legs: h.legs
    };
  });
  const result = await client.mutate({ mutation: insertHeroesMutation, variables: { objects: heroes } });
  return {
    message: `Added ${result.data.insert_dota2_hero.returning.length} heroes`,
    type: 'success'
  }
}

export async function insertTeamHeroes() {
  const { data: { dota2_team } } = await client.query<ITeamIDQueryResponse>({ query: queryTeamIDs })
  const teamIDs = dota2_team.map(t => t.team_id);
  teamIDs.map(id => {
    fetch(`${apiBaseUrl}/teams/${id}/heroes`).then(res => res.json())
    .then(result => {
      const teamHeroes = result.map((teamHero: any) => {
        return {
          team_id: id,
          hero_id: teamHero.hero_id,
          games_played: teamHero.games_played,
          wins: teamHero.wins,
        };
      });
      console.log({ teamHeroes });
      client.mutate({ mutation: insertTeamHeroesMutation, variables: { objects: teamHeroes } }).then(res => {
        console.log('inserted', res);
      });
    })
  });
}
